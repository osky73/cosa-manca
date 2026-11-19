-- Ricette proposte a tutti gli utenti: l'autore propone, il super admin approva (public) o rifiuta (rejected).
alter table public.recipes
  add column if not exists public_status text check (public_status in ('proposed','public','rejected')),
  add column if not exists author_name text,
  add column if not exists proposed_at timestamptz;

create index if not exists recipes_public_idx on public.recipes (public_status) where public_status is not null;

-- Le ricette pubbliche le leggono tutti gli utenti autenticati
drop policy if exists recipes_select on public.recipes;
create policy recipes_select on public.recipes for select to authenticated
  using (public.is_member(group_id) or public_status = 'public');

-- Il client non può toccare lo stato: solo le RPC
revoke insert, update on public.recipes from authenticated;
grant insert (id, group_id, title, steps, ingredients, created_by) on public.recipes to authenticated;
grant update (title, steps, ingredients) on public.recipes to authenticated;

-- Se una ricetta già proposta/pubblica viene modificata dall'autore, torna in attesa di approvazione
create or replace function public.recipes_reset_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.public_status in ('public','rejected')
     and (new.title is distinct from old.title or new.steps is distinct from old.steps
          or new.ingredients is distinct from old.ingredients)
     and not public.is_super_admin() then
    new.public_status := 'proposed';
    new.proposed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists recipes_reset_status on public.recipes;
create trigger recipes_reset_status before update on public.recipes
  for each row execute function public.recipes_reset_status();

create or replace function public.propose_recipe(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r public.recipes;
begin
  select * into r from public.recipes where id = p_id and created_by = auth.uid();
  if not found then raise exception 'Ricetta non trovata'; end if;
  if r.public_status in ('proposed','public') then return r.public_status; end if;
  update public.recipes
     set public_status = 'proposed', proposed_at = now(),
         author_name = coalesce((select nullif(display_name,'') from public.profiles where id = auth.uid()), 'Un utente')
   where id = p_id;
  return 'proposed';
end $$;

create or replace function public.withdraw_recipe(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.recipes set public_status = null, proposed_at = null
   where id = p_id and (created_by = auth.uid() or public.is_super_admin());
end $$;

create or replace function public.recipes_proposed()
returns table (id uuid, title text, steps text, ingredients text[], author_name text, proposed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Non autorizzato'; end if;
  return query select r.id, r.title, r.steps, r.ingredients, r.author_name, r.proposed_at
    from public.recipes r where r.public_status = 'proposed' order by r.proposed_at;
end $$;

create or replace function public.decide_recipe(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Non autorizzato'; end if;
  update public.recipes set public_status = case when p_approve then 'public' else 'rejected' end
   where id = p_id and public_status = 'proposed';
end $$;

revoke all on function public.propose_recipe(uuid), public.withdraw_recipe(uuid),
  public.recipes_proposed(), public.decide_recipe(uuid, boolean) from public, anon;
grant execute on function public.propose_recipe(uuid), public.withdraw_recipe(uuid),
  public.recipes_proposed(), public.decide_recipe(uuid, boolean) to authenticated;
