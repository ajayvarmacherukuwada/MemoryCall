alter table public.contacts
  add column if not exists contact_email text,
  add column if not exists contact_display_name text;

update public.contacts
set
  contact_email = email
where contact_email is null;

update public.contacts
set
  contact_display_name = display_name
where contact_display_name is null;

alter table public.contacts
  alter column contact_email set not null,
  alter column contact_display_name set not null;

create unique index if not exists contacts_owner_email_unique_idx
on public.contacts (owner_profile_id, lower(contact_email))
where deleted_at is null;

alter table public.call_invitations
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists mode text;

update public.call_invitations
set
  contact_id = coalesce(contact_id, caller_contact_id, callee_contact_id),
  mode = coalesce(mode, call_mode)
where contact_id is null
   or mode is null;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  secure_token text not null unique,
  inviter_profile_id uuid not null references public.profiles (id) on delete cascade,
  recipient_email text not null,
  recipient_display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_profile_id uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invitations_secure_token_unique_idx
on public.invitations (secure_token);

create index if not exists invitations_inviter_profile_id_idx on public.invitations (inviter_profile_id);
create index if not exists invitations_recipient_email_idx on public.invitations (lower(recipient_email));
create index if not exists invitations_status_idx on public.invitations (status);
create index if not exists invitations_expires_at_idx on public.invitations (expires_at);
create index if not exists invitations_deleted_at_idx on public.invitations (deleted_at);

alter table public.invitations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invitations'
      and policyname = 'invitations_select_own'
  ) then
    create policy "invitations_select_own"
    on public.invitations
    for select
    to authenticated
    using (inviter_profile_id = auth.uid() and deleted_at is null);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invitations'
      and policyname = 'invitations_insert_own'
  ) then
    create policy "invitations_insert_own"
    on public.invitations
    for insert
    to authenticated
    with check (inviter_profile_id = auth.uid() and deleted_at is null);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invitations'
      and policyname = 'invitations_update_own'
  ) then
    create policy "invitations_update_own"
    on public.invitations
    for update
    to authenticated
    using (inviter_profile_id = auth.uid() and deleted_at is null)
    with check (inviter_profile_id = auth.uid());
  end if;
end
$$;

grant select, insert, update on public.invitations to authenticated;
grant select, insert, update on public.invitations to service_role;

drop trigger if exists set_invitations_updated_at on public.invitations;

create trigger set_invitations_updated_at
before update on public.invitations
for each row execute function private.set_updated_at();


