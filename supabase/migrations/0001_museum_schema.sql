-- Museo escolar WebXR: esquema inicial, roles y políticas RLS.
-- Ejecutar como migración del proyecto Supabase. No contiene usuarios ni secretos.

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('admin', 'invitado');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'invitado',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 120)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_slug_format check (slug ~ '^[a-zA-Z0-9_-]{1,64}$'),
  constraint rooms_name_length check (char_length(name) between 1 and 120)
);

create table public.totems (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  code text not null,
  label text not null,
  position double precision[] not null default array[0, 0, 0]::double precision[],
  quaternion double precision[] not null default array[0, 0, 0, 1]::double precision[],
  scale double precision[] not null default array[1, 1, 1]::double precision[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, code),
  unique (id, room_id),
  constraint totems_code_format check (code ~ '^mesa-(0[1-9]|10)$'),
  constraint totems_label_length check (char_length(label) between 1 and 80),
  constraint totems_position_valid check (
    cardinality(position) = 3
    and position[1] between -1000 and 1000
    and position[2] between -1000 and 1000
    and position[3] between -1000 and 1000
  ),
  constraint totems_quaternion_valid check (
    cardinality(quaternion) = 4
    and quaternion[1] between -1 and 1
    and quaternion[2] between -1 and 1
    and quaternion[3] between -1 and 1
    and quaternion[4] between -1 and 1
    and abs(
      quaternion[1] * quaternion[1]
      + quaternion[2] * quaternion[2]
      + quaternion[3] * quaternion[3]
      + quaternion[4] * quaternion[4]
      - 1
    ) < 0.001
  ),
  constraint totems_scale_valid check (
    cardinality(scale) = 3
    and scale[1] between 0.000001 and 1000
    and scale[2] between 0.000001 and 1000
    and scale[3] between 0.000001 and 1000
  )
);

create table public.artworks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null,
  author text not null,
  description text not null default '',
  storage_path text not null unique,
  polygon_count integer,
  model_scale double precision not null default 1,
  color integer not null default 4947680,
  polygon_warning boolean generated always as (
    polygon_count is not null and polygon_count > 100000
  ) stored,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, room_id),
  constraint artworks_name_length check (char_length(name) between 1 and 160),
  constraint artworks_author_length check (char_length(author) between 1 and 160),
  constraint artworks_description_length check (char_length(description) <= 2000),
  constraint artworks_storage_path check (
    char_length(storage_path) between 7 and 300
    and lower(storage_path) like '%.stl'
  ),
  constraint artworks_polygon_count check (polygon_count is null or polygon_count >= 0),
  constraint artworks_model_scale check (model_scale between 0.000001 and 1000),
  constraint artworks_color check (color between 0 and 16777215)
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null,
  scene_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, scene_order),
  unique (id, room_id),
  constraint scenes_name_length check (char_length(name) between 1 and 120),
  constraint scenes_order_range check (scene_order between 1 and 3)
);

create table public.scene_assignments (
  scene_id uuid not null references public.scenes (id) on delete cascade,
  totem_id uuid not null references public.totems (id) on delete cascade,
  artwork_id uuid references public.artworks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scene_id, totem_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create trigger totems_set_updated_at
before update on public.totems
for each row execute function public.set_updated_at();

create trigger artworks_set_updated_at
before update on public.artworks
for each row execute function public.set_updated_at();

create trigger scenes_set_updated_at
before update on public.scenes
for each row execute function public.set_updated_at();

create trigger scene_assignments_set_updated_at
before update on public.scene_assignments
for each row execute function public.set_updated_at();

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
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- El proyecto puede tener usuarios creados antes de esta migración. El trigger
-- cubre los nuevos; este backfill crea, como invitado, los perfiles existentes.
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

create or replace function public.validate_scene_assignment_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scene_room_id uuid;
  totem_room_id uuid;
  artwork_room_id uuid;
begin
  select room_id into scene_room_id from public.scenes where id = new.scene_id;
  select room_id into totem_room_id from public.totems where id = new.totem_id;

  if scene_room_id is distinct from totem_room_id then
    raise exception 'La escena y la mesa deben pertenecer a la misma sala.';
  end if;

  if new.artwork_id is not null then
    select room_id into artwork_room_id from public.artworks where id = new.artwork_id;

    if scene_room_id is distinct from artwork_room_id then
      raise exception 'La escena y la obra deben pertenecer a la misma sala.';
    end if;
  end if;

  return new;
end;
$$;

create trigger scene_assignments_validate_room
before insert or update on public.scene_assignments
for each row execute function public.validate_scene_assignment_room();

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.totems enable row level security;
alter table public.artworks enable row level security;
alter table public.scenes enable row level security;
alter table public.scene_assignments enable row level security;

create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));

create policy "rooms_select_published_or_admin"
on public.rooms for select
to authenticated
using (is_published or (select private.is_admin()));

create policy "rooms_admin_write"
on public.rooms for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "totems_select_published_or_admin"
on public.totems for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.rooms
    where rooms.id = totems.room_id and rooms.is_published
  )
);

create policy "totems_admin_write"
on public.totems for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "artworks_select_published_or_admin"
on public.artworks for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.rooms
    where rooms.id = artworks.room_id and rooms.is_published
  )
);

create policy "artworks_admin_write"
on public.artworks for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "scenes_select_published_or_admin"
on public.scenes for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.rooms
    where rooms.id = scenes.room_id and rooms.is_published
  )
);

create policy "scenes_admin_write"
on public.scenes for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "scene_assignments_select_published_or_admin"
on public.scene_assignments for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.scenes
    join public.rooms on rooms.id = scenes.room_id
    where scenes.id = scene_assignments.scene_id and rooms.is_published
  )
);

create policy "scene_assignments_admin_write"
on public.scene_assignments for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.profiles from anon, authenticated;
revoke all on public.rooms from anon, authenticated;
revoke all on public.totems from anon, authenticated;
revoke all on public.artworks from anon, authenticated;
revoke all on public.scenes from anon, authenticated;
revoke all on public.scene_assignments from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.totems to authenticated;
grant select, insert, update, delete on public.artworks to authenticated;
grant select, insert, update, delete on public.scenes to authenticated;
grant select, insert, update, delete on public.scene_assignments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('museum-stl', 'museum-stl', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "museum_stl_authenticated_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'museum-stl'
  and (
    (select private.is_admin())
    or exists (
      select 1
      from public.artworks
      join public.rooms on rooms.id = artworks.room_id
      where artworks.storage_path = storage.objects.name
        and rooms.is_published
    )
  )
);

create policy "museum_stl_admin_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'museum-stl'
  and lower(storage.extension(name)) = 'stl'
  and (select private.is_admin())
);

create policy "museum_stl_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'museum-stl' and (select private.is_admin()))
with check (
  bucket_id = 'museum-stl'
  and lower(storage.extension(name)) = 'stl'
  and (select private.is_admin())
);

create policy "museum_stl_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'museum-stl' and (select private.is_admin()));
