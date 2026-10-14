-- Reparación idempotente para proyectos donde public.profiles no quedó creado
-- o expuesto después de ejecutar 0001_museum_schema.sql.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

do $$
begin
  create type public.app_role as enum ('admin', 'invitado');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'invitado',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 120)
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'invitado',
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, role, display_name)
select
  users.id,
  'invitado',
  nullif(left(trim(coalesce(users.raw_user_meta_data ->> 'display_name', '')), 120), '')
from auth.users as users
on conflict (id) do nothing;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

commit;

notify pgrst, 'reload schema';
