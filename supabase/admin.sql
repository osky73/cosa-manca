-- Schermata "Stato servizi" (solo super admin): contatori dell'app e conteggio delle chiamate a Google Maps.
-- Da eseguire una volta nello SQL editor di Supabase.

create table if not exists public.map_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('load', 'search', 'details'))
);
create index if not exists map_usage_created on public.map_usage (created_at);
alter table public.map_usage enable row level security;  -- nessuna policy: si scrive/legge solo dalle funzioni

-- ogni persona che usa la mappa registra una chiamata (solo un contatore, nessun dato personale)
create or replace function public.log_map(p_kind text) returns void
language sql security definer set search_path = public as $$
  insert into public.map_usage (kind) select p_kind where auth.uid() is not null and p_kind in ('load', 'search', 'details');
$$;
revoke all on function public.log_map(text) from public, anon;
grant execute on function public.log_map(text) to authenticated;

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare m date := date_trunc('month', now())::date;
begin
  if not public.is_super_admin() then raise exception 'Non autorizzato'; end if;
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'users_7d_new', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'groups_total', (select count(*) from public.groups),
    'groups_active_30d', (select count(distinct group_id) from public.needs where requested_at > now() - interval '30 days'),
    'needs_total', (select count(*) from public.needs),
    'db_bytes', pg_database_size(current_database()),
    'map_load', (select count(*) from public.map_usage where kind = 'load' and created_at >= m),
    'map_search', (select count(*) from public.map_usage where kind = 'search' and created_at >= m),
    'map_details', (select count(*) from public.map_usage where kind = 'details' and created_at >= m)
  );
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
