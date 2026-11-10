-- Richieste di ammissione come amministratore: chi arriva dal sito resta "in attesa" finché il super admin lo ammette.
create table if not exists public.admin_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  notified boolean not null default false
);
alter table public.admin_requests enable row level security;
-- nessuna policy: si passa solo dalle funzioni qui sotto

-- Stato di chi è loggato: 'ok' (può creare un gruppo), 'pending' (in attesa), 'rejected', 'none'.
create or replace function public.my_admin_status() returns text
language plpgsql security definer set search_path = public, auth as $$
declare mail text; st text;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  select lower(email) into mail from auth.users where id = auth.uid();
  if not exists (select 1 from public.admin_allowlist) or exists (select 1 from public.admin_allowlist where email = mail) then
    return 'ok';
  end if;
  select status into st from public.admin_requests where user_id = auth.uid();
  return coalesce(st, 'none');
end $$;

-- Chiede di diventare amministratore. Restituisce 'ok', 'pending' (già in attesa), 'rejected' o 'new' (richiesta appena creata).
create or replace function public.request_admin() returns text
language plpgsql security definer set search_path = public, auth as $$
declare mail text; cur text; nm text;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  cur := public.my_admin_status();
  if cur <> 'none' then return cur; end if;
  select lower(email) into mail from auth.users where id = auth.uid();
  select display_name into nm from public.profiles where id = auth.uid();
  insert into public.admin_requests (user_id, email, display_name) values (auth.uid(), mail, nm)
    on conflict (user_id) do nothing;
  return 'new';
end $$;

-- Elenco delle richieste in attesa (solo super admin).
create or replace function public.admin_requests_list() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'Non autorizzato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', r.email,
      'display_name', coalesce(p.display_name, r.display_name), 'created_at', r.created_at) order by r.created_at)
    from public.admin_requests r left join public.profiles p on p.id = r.user_id
    where r.status = 'pending'), '[]'::jsonb);
end $$;

create or replace function public.decide_admin_request(p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
declare mail text;
begin
  if not public.is_super_admin() then raise exception 'Non autorizzato'; end if;
  select email into mail from public.admin_requests where user_id = p_user and status = 'pending';
  if mail is null then raise exception 'Richiesta non trovata'; end if;
  if p_approve then insert into public.admin_allowlist (email) values (lower(mail)) on conflict do nothing; end if;
  update public.admin_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
    where user_id = p_user;
end $$;

revoke all on function public.my_admin_status() from public, anon;
revoke all on function public.request_admin() from public, anon;
revoke all on function public.admin_requests_list() from public, anon;
revoke all on function public.decide_admin_request(uuid, boolean) from public, anon;
grant execute on function public.my_admin_status() to authenticated;
grant execute on function public.request_admin() to authenticated;
grant execute on function public.admin_requests_list() to authenticated;
grant execute on function public.decide_admin_request(uuid, boolean) to authenticated;

-- Chi è già registrato, senza gruppo e senza permesso, entra in attesa (così il super admin le vede subito).
insert into public.admin_requests (user_id, email, display_name)
select u.id, lower(u.email), p.display_name
from auth.users u left join public.profiles p on p.id = u.id
where lower(u.email) <> 'andrea.valle.1973@gmail.com'
  and not exists (select 1 from public.memberships m where m.user_id = u.id)
  and not exists (select 1 from public.admin_allowlist a where a.email = lower(u.email))
on conflict (user_id) do nothing;
