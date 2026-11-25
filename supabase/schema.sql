-- KindLink database schema for Supabase
-- Run this file in Supabase -> SQL Editor -> New query.
-- The policies below are intentionally restrictive. Do not disable RLS.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Profiles: one public profile per authenticated account.
-- Volunteer profiles are private; organization profiles are visible publicly.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  role text not null check (role in ('volunteer', 'organization')),
  organization_name text,
  city text,
  bio text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint organization_name_required check (role <> 'organization' or (organization_name is not null and char_length(organization_name) between 2 and 120))
);

-- -----------------------------------------------------------------------------
-- Projects: organizations create projects; only published projects are public.
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 4 and 120),
  description text not null check (char_length(description) between 20 and 3000),
  category text not null check (category in ('Экология', 'Образование', 'Помощь людям', 'Животные', 'Другое')),
  city text not null check (char_length(city) between 2 and 80),
  event_date date,
  format text not null default 'offline' check (format in ('offline', 'online', 'hybrid')),
  participants_needed integer not null default 10 check (participants_needed between 1 and 10000),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Applications: volunteers can apply once to a published project.
-- Organization decisions are made only through the secure RPC below.
-- -----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 800),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (project_id, volunteer_id)
);

create index if not exists projects_status_created_idx on public.projects(status, created_at desc);
create index if not exists projects_organization_idx on public.projects(organization_id);
create index if not exists applications_volunteer_idx on public.applications(volunteer_id, created_at desc);
create index if not exists applications_project_idx on public.applications(project_id, created_at desc);

-- Keep updated_at current for project edits.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Create a profile automatically after a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role text;
  chosen_name text;
  chosen_org text;
begin
  chosen_role := case
    when new.raw_user_meta_data ->> 'role' = 'organization' then 'organization'
    else 'volunteer'
  end;
  chosen_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  chosen_org := nullif(trim(new.raw_user_meta_data ->> 'organization_name'), '');

  insert into public.profiles (id, full_name, role, organization_name, city)
  values (
    new.id,
    coalesce(chosen_name, 'Участник KindLink'),
    chosen_role,
    case when chosen_role = 'organization' then coalesce(chosen_org, 'Новая организация') else null end,
    nullif(trim(new.raw_user_meta_data ->> 'city'), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Small SECURITY DEFINER helpers avoid RLS recursion when policies inspect profiles.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_verified_organization()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'organization' and is_verified = true
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS and grants
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.applications enable row level security;

-- A volunteer's basic profile is visible only to an organization that received
-- that volunteer's application. The function runs as the database owner so it
-- can safely check the relationship without recursive RLS evaluation.
create or replace function public.can_view_applicant_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.projects p on p.id = a.project_id
    where a.volunteer_id = p_profile_id
      and p.organization_id = auth.uid()
      and public.current_profile_role() = 'organization'
  );
$$;

-- Profiles: public visitors see organization cards; volunteers are private;
-- an organization sees a volunteer's display name/city only after an application.
drop policy if exists "profiles_select_own_or_organizations" on public.profiles;
create policy "profiles_select_own_or_organizations"
on public.profiles for select
to anon, authenticated
using (
  role = 'organization'
  or id = auth.uid()
  or public.can_view_applicant_profile(id)
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Do not allow clients to edit a role or verification flag.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, organization_name, city, bio) on table public.profiles to authenticated;
grant select on table public.profiles to anon, authenticated;

-- Projects: anyone can read published projects; organizations can read/manage their own.
drop policy if exists "projects_public_or_owner_read" on public.projects;
create policy "projects_public_or_owner_read"
on public.projects for select
to anon, authenticated
using (status = 'published' or organization_id = auth.uid());

drop policy if exists "organizations_insert_projects" on public.projects;
create policy "organizations_insert_projects"
on public.projects for insert
to authenticated
with check (
  organization_id = auth.uid()
  and public.current_profile_role() = 'organization'
  and (status = 'draft' or (status = 'published' and public.is_verified_organization()))
);

drop policy if exists "organizations_update_projects" on public.projects;
create policy "organizations_update_projects"
on public.projects for update
to authenticated
using (organization_id = auth.uid() and public.current_profile_role() = 'organization')
with check (
  organization_id = auth.uid()
  and public.current_profile_role() = 'organization'
  and (status in ('draft', 'closed') or (status = 'published' and public.is_verified_organization()))
);

drop policy if exists "organizations_delete_projects" on public.projects;
create policy "organizations_delete_projects"
on public.projects for delete
to authenticated
using (organization_id = auth.uid() and public.current_profile_role() = 'organization');

grant select on table public.projects to anon, authenticated;
grant insert, update, delete on table public.projects to authenticated;

-- Applications: volunteers can see their own; project owners can see incoming applications.
drop policy if exists "applications_read_applicant_or_project_owner" on public.applications;
create policy "applications_read_applicant_or_project_owner"
on public.applications for select
to authenticated
using (
  volunteer_id = auth.uid()
  or exists (
    select 1 from public.projects p
    where p.id = applications.project_id and p.organization_id = auth.uid()
  )
);

drop policy if exists "volunteers_apply_to_published_projects" on public.applications;
create policy "volunteers_apply_to_published_projects"
on public.applications for insert
to authenticated
with check (
  volunteer_id = auth.uid()
  and public.current_profile_role() = 'volunteer'
  and status = 'pending'
  and exists (
    select 1 from public.projects p
    where p.id = applications.project_id and p.status = 'published'
  )
);

-- Clients cannot directly edit/delete applications. Organizations use the RPC function.
revoke update, delete on table public.applications from anon, authenticated;
grant select on table public.applications to authenticated;
grant insert on table public.applications to authenticated;

create or replace function public.set_application_status(p_application_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owns_application boolean;
begin
  if auth.uid() is null or public.current_profile_role() <> 'organization' then
    raise exception 'Only organization accounts can review applications';
  end if;

  if p_status not in ('accepted', 'rejected') then
    raise exception 'Invalid application status';
  end if;

  select exists (
    select 1
    from public.applications a
    join public.projects p on p.id = a.project_id
    where a.id = p_application_id and p.organization_id = auth.uid()
  ) into owns_application;

  if not owns_application then
    raise exception 'Application not found for this organization';
  end if;

  update public.applications
  set status = p_status
  where id = p_application_id and status = 'pending';
end;
$$;

revoke all on function public.set_application_status(uuid, text) from public;
grant execute on function public.set_application_status(uuid, text) to authenticated;

-- Public/anonymous users can browse published projects and organization profiles only.
-- Never place a Supabase service_role key in frontend code.
