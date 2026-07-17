create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  contact_profile_id uuid not null references public.profiles (id) on delete cascade,
  contact_email text not null,
  contact_display_name text not null,
  nickname text,
  last_verified_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contacts_owner_contact_unique_idx
on public.contacts (owner_profile_id, contact_profile_id)
where deleted_at is null;

create unique index if not exists contacts_owner_email_unique_idx
on public.contacts (owner_profile_id, lower(contact_email))
where deleted_at is null;

create index if not exists contacts_owner_profile_id_idx on public.contacts (owner_profile_id);
create index if not exists contacts_contact_profile_id_idx on public.contacts (contact_profile_id);
create index if not exists contacts_deleted_at_idx on public.contacts (deleted_at);

alter table public.contacts enable row level security;

create policy "contacts_select_own"
on public.contacts
for select
to authenticated
using (owner_profile_id = auth.uid() and deleted_at is null);

create policy "contacts_insert_own"
on public.contacts
for insert
to authenticated
with check (owner_profile_id = auth.uid() and deleted_at is null);

create policy "contacts_update_own"
on public.contacts
for update
to authenticated
using (owner_profile_id = auth.uid() and deleted_at is null)
with check (owner_profile_id = auth.uid());

grant select, insert, update on public.contacts to authenticated;
grant select, insert, update on public.contacts to service_role;

create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function private.set_updated_at();

create table if not exists public.call_invitations (
  id uuid primary key default gen_random_uuid(),
  call_id text not null unique,
  caller_profile_id uuid not null references public.profiles (id) on delete cascade,
  callee_profile_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  mode text not null check (mode in ('video', 'audio')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_invitations_call_id_idx on public.call_invitations (call_id);
create index if not exists call_invitations_caller_profile_id_idx on public.call_invitations (caller_profile_id);
create index if not exists call_invitations_callee_profile_id_idx on public.call_invitations (callee_profile_id);
create index if not exists call_invitations_status_idx on public.call_invitations (status);
create index if not exists call_invitations_expires_at_idx on public.call_invitations (expires_at);
create index if not exists call_invitations_deleted_at_idx on public.call_invitations (deleted_at);

alter table public.call_invitations enable row level security;

create policy "call_invitations_select_own"
on public.call_invitations
for select
to authenticated
using ((caller_profile_id = auth.uid() or callee_profile_id = auth.uid()) and deleted_at is null);

create policy "call_invitations_insert_caller"
on public.call_invitations
for insert
to authenticated
with check (caller_profile_id = auth.uid() and deleted_at is null);

create policy "call_invitations_update_participants"
on public.call_invitations
for update
to authenticated
using ((caller_profile_id = auth.uid() or callee_profile_id = auth.uid()) and deleted_at is null)
with check (caller_profile_id = auth.uid() or callee_profile_id = auth.uid());

grant select, insert, update on public.call_invitations to authenticated;
grant select, insert, update on public.call_invitations to service_role;

create trigger set_call_invitations_updated_at
before update on public.call_invitations
for each row execute function private.set_updated_at();
