-- ============================================================
-- Cosa manca — schema Supabase (fase 1, pensato per multi-gruppo)
-- Esegui TUTTO questo file nel SQL Editor di Supabase (una volta).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tabelle ----------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

-- Catalogo predefinito GLOBALE (gestito dal super-admin, non dai gruppi)
create table public.catalog_items (
  id serial primary key,
  name text not null,
  category text not null,
  sort int not null default 0
);

-- Se vuota => la registrazione di nuovi amministratori è aperta a tutti.
-- Se contiene email => solo quelle possono creare un gruppo (fase 1).
create table public.admin_allowlist (
  email text primary key check (email = lower(email))
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#2f7d4f',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.stores (group_id);

create table public.group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Altro',
  recurrence text not null default 'recurring' check (recurrence in ('recurring', 'one_off')),
  hidden boolean not null default false,
  archived boolean not null default false,
  default_store_id uuid references public.stores on delete set null,
  source_catalog_id int references public.catalog_items on delete set null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on public.group_items (group_id);
create unique index group_items_unique_name
  on public.group_items (group_id, lower(name)) where not archived;

-- Una "richiesta" = qualcuno ha segnato che manca qualcosa.
create table public.needs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  item_id uuid not null references public.group_items on delete cascade,
  status text not null default 'missing' check (status in ('missing', 'bought')),
  store_id uuid references public.stores on delete set null,
  note text,
  requested_by uuid references auth.users on delete set null,
  requested_at timestamptz not null default now(),
  bought_by uuid references auth.users on delete set null,
  bought_at timestamptz
);
create index on public.needs (group_id, status);
create unique index needs_one_open_per_item on public.needs (item_id) where status = 'missing';

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Altro',
  recurrence text not null check (recurrence in ('recurring', 'one_off')),
  note text,
  store_id uuid references public.stores on delete set null,
  suggested_by uuid references auth.users on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.suggestions (group_id, status);

-- ---------- Funzioni di supporto (security definer, evitano ricorsioni RLS) ----------

create function public.is_member(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships where group_id = g and user_id = auth.uid())
$$;

create function public.is_admin(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships where group_id = g and user_id = auth.uid() and role = 'admin')
$$;

-- ---------- Profilo automatico alla registrazione ----------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Trigger di integrità ----------

-- Non si può rimuovere / declassare l'ultimo admin di un gruppo.
create function public.memberships_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if exists (select 1 from public.groups where id = old.group_id)
       and not exists (
         select 1 from public.memberships
         where group_id = old.group_id and role = 'admin' and user_id <> old.user_id
       ) then
      raise exception 'Non puoi lasciare il gruppo senza amministratore';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_guard_trg
  before update or delete on public.memberships
  for each row execute function public.memberships_guard();

create function public.needs_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select group_id into g from public.group_items where id = new.item_id;
  if g is null then raise exception 'Prodotto inesistente'; end if;
  new.group_id := g;
  new.requested_by := auth.uid();
  new.requested_at := now();
  new.status := 'missing';
  new.bought_by := null;
  new.bought_at := null;
  if new.store_id is not null and not exists (
    select 1 from public.stores where id = new.store_id and group_id = g
  ) then
    raise exception 'Supermercato non valido';
  end if;
  return new;
end $$;

create trigger needs_bi before insert on public.needs
  for each row execute function public.needs_before_insert();

create function public.needs_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.item_id := old.item_id;
  new.group_id := old.group_id;
  new.requested_by := old.requested_by;
  new.requested_at := old.requested_at;
  if new.store_id is not null and not exists (
    select 1 from public.stores where id = new.store_id and group_id = old.group_id
  ) then
    raise exception 'Supermercato non valido';
  end if;
  if old.status = 'missing' and new.status = 'bought' then
    new.bought_by := auth.uid();
    new.bought_at := now();
    update public.group_items set archived = true
      where id = new.item_id and recurrence = 'one_off';
  elsif old.status = 'bought' and new.status = 'missing' then
    new.bought_by := null;
    new.bought_at := null;
    update public.group_items set archived = false
      where id = new.item_id and recurrence = 'one_off';
  end if;
  return new;
end $$;

create trigger needs_bu before update on public.needs
  for each row execute function public.needs_before_update();

-- Se si annulla una richiesta "una tantum", il prodotto sparisce.
create function public.needs_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'missing' then
    update public.group_items set archived = true
      where id = old.item_id and recurrence = 'one_off';
  end if;
  return old;
end $$;

create trigger needs_ad after delete on public.needs
  for each row execute function public.needs_after_delete();

-- ---------- RPC ----------

-- Crea un gruppo, ti rende admin e copia il catalogo predefinito.
create function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  g uuid;
begin
  if uid is null then raise exception 'Non autenticato'; end if;
  select lower(email) into mail from auth.users where id = uid;
  if exists (select 1 from public.admin_allowlist)
     and not exists (select 1 from public.admin_allowlist where email = mail) then
    raise exception 'La creazione di nuovi gruppi non è ancora aperta. Chiedi un invito.';
  end if;

  insert into public.groups (name, created_by) values (trim(p_name), uid) returning id into g;
  insert into public.memberships (group_id, user_id, role) values (g, uid, 'admin');
  insert into public.group_items (group_id, name, category, recurrence, source_catalog_id, created_by)
    select g, c.name, c.category, 'recurring', c.id, uid
    from public.catalog_items c order by c.sort;
  return g;
end $$;

-- Entra nei gruppi per cui esiste un invito con la mia email.
create function public.accept_my_invitations() returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  n int := 0;
  r record;
begin
  if uid is null then return 0; end if;
  select lower(email) into mail from auth.users where id = uid;
  for r in select * from public.invitations where email = mail loop
    insert into public.memberships (group_id, user_id, role)
      values (r.group_id, uid, r.role) on conflict do nothing;
    delete from public.invitations where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Propone/aggiunge un prodotto con le regole dei ruoli:
--  * admin            -> aggiunge subito (e, se vuole, lo segna come mancante)
--  * membro, una tantum -> compare subito in lista (non tocca il catalogo)
--  * membro, ricorrente -> suggerimento in attesa di approvazione
-- Ritorna 'added' | 'pending'.
create function public.propose_item(
  p_group uuid, p_name text, p_category text, p_recurrence text,
  p_note text default null, p_store uuid default null, p_mark_missing boolean default true
) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm text := trim(p_name);
  cat text := coalesce(nullif(trim(p_category), ''), 'Altro');
  item uuid;
  admin_ok boolean;
begin
  if not public.is_member(p_group) then raise exception 'Non sei in questo gruppo'; end if;
  if p_recurrence not in ('recurring', 'one_off') then raise exception 'Ricorrenza non valida'; end if;
  if nm = '' then raise exception 'Nome mancante'; end if;
  if p_store is not null and not exists (select 1 from public.stores where id = p_store and group_id = p_group) then
    raise exception 'Supermercato non valido';
  end if;
  admin_ok := public.is_admin(p_group);

  if admin_ok or p_recurrence = 'one_off' then
    insert into public.group_items (group_id, name, category, recurrence, created_by)
      values (p_group, nm, cat, p_recurrence, uid) returning id into item;
    if p_recurrence = 'one_off' or p_mark_missing then
      insert into public.needs (group_id, item_id, store_id, note) values (p_group, item, p_store, nullif(trim(p_note), ''));
    end if;
    insert into public.suggestions (group_id, name, category, recurrence, note, store_id, suggested_by, status, decided_by, decided_at)
      values (p_group, nm, cat, p_recurrence, nullif(trim(p_note), ''), p_store, uid, 'approved', case when admin_ok then uid end, now());
    return 'added';
  end if;

  insert into public.suggestions (group_id, name, category, recurrence, note, store_id, suggested_by)
    values (p_group, nm, cat, p_recurrence, nullif(trim(p_note), ''), p_store, uid);
  return 'pending';
end $$;

-- L'admin approva o rifiuta un suggerimento ricorrente.
create function public.decide_suggestion(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.suggestions;
  item uuid;
begin
  select * into s from public.suggestions where id = p_id for update;
  if s.id is null then raise exception 'Suggerimento inesistente'; end if;
  if not public.is_admin(s.group_id) then raise exception 'Solo gli admin possono decidere'; end if;
  if s.status <> 'pending' then return; end if;

  if p_approve then
    insert into public.group_items (group_id, name, category, recurrence, created_by)
      values (s.group_id, s.name, s.category, s.recurrence, s.suggested_by) returning id into item;
    insert into public.needs (group_id, item_id, store_id, note) values (s.group_id, item, s.store_id, s.note);
    update public.suggestions set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = p_id;
  else
    update public.suggestions set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_id;
  end if;
end $$;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.catalog_items enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.stores enable row level security;
alter table public.group_items enable row level security;
alter table public.needs enable row level security;
alter table public.suggestions enable row level security;

-- profiles: vedo me stesso e i membri dei miei gruppi
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid() or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id and public.is_member(m.group_id)
    )
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups
create policy groups_select on public.groups for select to authenticated using (public.is_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
create policy groups_delete on public.groups for delete to authenticated using (public.is_admin(id));

-- memberships (inserimenti solo tramite funzioni)
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(group_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_admin(group_id) or user_id = auth.uid());

-- invitations: solo gli admin del gruppo
create policy invitations_select on public.invitations for select to authenticated using (public.is_admin(group_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_admin(group_id) and invited_by = auth.uid());
create policy invitations_delete on public.invitations for delete to authenticated using (public.is_admin(group_id));

-- catalogo globale: lettura per tutti gli utenti loggati
create policy catalog_select on public.catalog_items for select to authenticated using (true);
-- admin_allowlist: nessuna policy => nessun accesso dal client

-- stores
create policy stores_select on public.stores for select to authenticated using (public.is_member(group_id));
create policy stores_insert on public.stores for insert to authenticated with check (public.is_admin(group_id));
create policy stores_update on public.stores for update to authenticated
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy stores_delete on public.stores for delete to authenticated using (public.is_admin(group_id));

-- group_items: i membri leggono; solo admin modificano (i membri passano da propose_item)
create policy items_select on public.group_items for select to authenticated using (public.is_member(group_id));
create policy items_update on public.group_items for update to authenticated
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy items_delete on public.group_items for delete to authenticated using (public.is_admin(group_id));

-- needs: tutti i membri possono segnare, cambiare supermercato, comprare, annullare
create policy needs_select on public.needs for select to authenticated using (public.is_member(group_id));
create policy needs_insert on public.needs for insert to authenticated with check (public.is_member(group_id));
create policy needs_update on public.needs for update to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy needs_delete on public.needs for delete to authenticated
  using (public.is_member(group_id) and status = 'missing');

-- suggestions: lettura per i membri; scrittura solo via funzioni
create policy suggestions_select on public.suggestions for select to authenticated using (public.is_member(group_id));

-- ---------- Permessi sulle funzioni ----------
revoke all on function public.create_group(text) from public, anon;
revoke all on function public.accept_my_invitations() from public, anon;
revoke all on function public.propose_item(uuid, text, text, text, text, uuid, boolean) from public, anon;
revoke all on function public.decide_suggestion(uuid, boolean) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.accept_my_invitations() to authenticated;
grant execute on function public.propose_item(uuid, text, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.decide_suggestion(uuid, boolean) to authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.needs;
alter publication supabase_realtime add table public.group_items;
alter publication supabase_realtime add table public.suggestions;
alter publication supabase_realtime add table public.stores;
alter publication supabase_realtime add table public.memberships;

-- ---------- Catalogo predefinito PROVVISORIO (lo sostituiamo con la tua lista) ----------
insert into public.catalog_items (name, category, sort) values
  ('Latte', 'Frigo', 10), ('Burro', 'Frigo', 11), ('Uova', 'Frigo', 12), ('Yogurt', 'Frigo', 13),
  ('Formaggio', 'Frigo', 14), ('Mozzarella', 'Frigo', 15), ('Prosciutto', 'Frigo', 16),
  ('Pasta', 'Dispensa', 20), ('Riso', 'Dispensa', 21), ('Farina', 'Dispensa', 22), ('Zucchero', 'Dispensa', 23),
  ('Caffè', 'Dispensa', 24), ('Olio d''oliva', 'Dispensa', 25), ('Sale', 'Dispensa', 26), ('Pane', 'Dispensa', 27),
  ('Biscotti', 'Dispensa', 28), ('Cereali', 'Dispensa', 29), ('Passata di pomodoro', 'Dispensa', 30),
  ('Tonno in scatola', 'Dispensa', 31),
  ('Mele', 'Frutta e verdura', 40), ('Banane', 'Frutta e verdura', 41), ('Insalata', 'Frutta e verdura', 42),
  ('Pomodori', 'Frutta e verdura', 43), ('Patate', 'Frutta e verdura', 44), ('Cipolle', 'Frutta e verdura', 45),
  ('Limoni', 'Frutta e verdura', 46),
  ('Acqua naturale', 'Bevande', 50), ('Acqua gasata', 'Bevande', 51), ('Succo di frutta', 'Bevande', 52),
  ('Birra', 'Bevande', 53), ('Vino', 'Bevande', 54),
  ('Carta igienica', 'Igiene e casa', 60), ('Fazzoletti di carta', 'Igiene e casa', 61),
  ('Carta da cucina', 'Igiene e casa', 62), ('Detersivo piatti', 'Igiene e casa', 63),
  ('Detersivo lavatrice', 'Igiene e casa', 64), ('Sapone mani', 'Igiene e casa', 65),
  ('Shampoo', 'Igiene e casa', 66), ('Dentifricio', 'Igiene e casa', 67),
  ('Sacchetti spazzatura', 'Igiene e casa', 68), ('Spugne', 'Igiene e casa', 69),
  ('Piselli surgelati', 'Surgelati', 80), ('Pizza surgelata', 'Surgelati', 81), ('Gelato', 'Surgelati', 82);

-- Fase 1: solo tu puoi creare un gruppo. SOSTITUISCI con la tua email, poi esegui:
-- insert into public.admin_allowlist (email) values ('la-tua-email@esempio.it');
