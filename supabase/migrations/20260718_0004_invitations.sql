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

create policy "invitations_select_own"
on public.invitations
for select
to authenticated
using (inviter_profile_id = auth.uid() and deleted_at is null);

create policy "invitations_insert_own"
on public.invitations
for insert
to authenticated
with check (inviter_profile_id = auth.uid() and deleted_at is null);

create policy "invitations_update_own"
on public.invitations
for update
to authenticated
using (inviter_profile_id = auth.uid() and deleted_at is null)
with check (inviter_profile_id = auth.uid());

grant select, insert, update on public.invitations to authenticated;
grant select, insert, update on public.invitations to service_role;

create trigger set_invitations_updated_at
before update on public.invitations
for each row execute function private.set_updated_at();