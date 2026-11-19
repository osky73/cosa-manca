-- Ricette condivise nel gruppo. Ognuno ne scrive; modifica/cancella solo chi l'ha scritta o l'admin.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  steps text check (steps is null or char_length(steps) <= 5000),
  ingredients text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists recipes_group_idx on public.recipes (group_id, created_at desc);
alter table public.recipes enable row level security;
create policy recipes_select on public.recipes for select to authenticated using (public.is_member(group_id));
create policy recipes_insert on public.recipes for insert to authenticated
  with check (public.is_member(group_id) and created_by = auth.uid());
create policy recipes_update on public.recipes for update to authenticated
  using (created_by = auth.uid() or public.is_admin(group_id))
  with check (public.is_member(group_id));
create policy recipes_delete on public.recipes for delete to authenticated
  using (created_by = auth.uid() or public.is_admin(group_id));
