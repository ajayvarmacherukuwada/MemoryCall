create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  photo_url text,
  timezone text not null default 'UTC',
  locale text,
  onboarded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_created_at_idx on public.profiles (created_at);
create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid() and deleted_at is null);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid() and deleted_at is null);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid() and deleted_at is null)
with check (id = auth.uid());

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- device_sessions
create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_identifier text not null,
  device_name text,
  platform text,
  platform_version text,
  app_version text,
  last_seen_at timestamptz,
  signed_in_at timestamptz,
  signed_out_at timestamptz,
  revoked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists device_sessions_profile_device_unique_idx
on public.device_sessions (profile_id, device_identifier)
where deleted_at is null;
create index if not exists device_sessions_profile_id_idx on public.device_sessions (profile_id);
create index if not exists device_sessions_last_seen_at_idx on public.device_sessions (last_seen_at);
create index if not exists device_sessions_deleted_at_idx on public.device_sessions (deleted_at);

alter table public.device_sessions enable row level security;

create policy "device_sessions_select_own"
on public.device_sessions
for select
to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy "device_sessions_insert_own"
on public.device_sessions
for insert
to authenticated
with check (profile_id = auth.uid() and deleted_at is null);

create policy "device_sessions_update_own"
on public.device_sessions
for update
to authenticated
using (profile_id = auth.uid() and deleted_at is null)
with check (profile_id = auth.uid());

grant select, insert, update on public.device_sessions to authenticated;
grant select, insert, update on public.device_sessions to service_role;

create trigger set_device_sessions_updated_at
before update on public.device_sessions
for each row execute function private.set_updated_at();

-- archive_providers
create table if not exists public.archive_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  supports_channel_verification boolean not null default false,
  supports_resumable_upload boolean not null default false,
  supports_token_refresh boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists archive_providers_is_active_idx on public.archive_providers (is_active);
create index if not exists archive_providers_provider_key_idx on public.archive_providers (provider_key);

alter table public.archive_providers enable row level security;

create policy "archive_providers_select_authenticated"
on public.archive_providers
for select
to authenticated
using (is_active = true);

grant select on public.archive_providers to authenticated;
grant select on public.archive_providers to service_role;

create trigger set_archive_providers_updated_at
before update on public.archive_providers
for each row execute function private.set_updated_at();

insert into public.archive_providers (
  provider_key,
  display_name,
  description,
  is_active,
  supports_channel_verification,
  supports_resumable_upload,
  supports_token_refresh
)
values (
  'youtube',
  'YouTube',
  'Private memory archive provider for YouTube uploads.',
  true,
  true,
  true,
  true
)
on conflict (provider_key)
do update set
  display_name = excluded.display_name,
  description = excluded.description,
  is_active = excluded.is_active,
  supports_channel_verification = excluded.supports_channel_verification,
  supports_resumable_upload = excluded.supports_resumable_upload,
  supports_token_refresh = excluded.supports_token_refresh,
  updated_at = now();

-- provider_accounts
create table if not exists public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  archive_provider_id uuid not null references public.archive_providers (id) on delete restrict,
  provider_subject text not null,
  provider_email text,
  provider_display_name text,
  provider_photo_url text,
  connection_status text not null default 'onboarding' check (connection_status in ('connected', 'onboarding', 'needs_reconnect', 'revoked', 'disabled')),
  archive_enabled boolean not null default false,
  last_verified_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists provider_accounts_profile_provider_unique_idx
on public.provider_accounts (profile_id, archive_provider_id)
where deleted_at is null;
create unique index if not exists provider_accounts_provider_subject_unique_idx
on public.provider_accounts (archive_provider_id, provider_subject)
where deleted_at is null;
create index if not exists provider_accounts_profile_id_idx on public.provider_accounts (profile_id);
create index if not exists provider_accounts_archive_provider_id_idx on public.provider_accounts (archive_provider_id);
create index if not exists provider_accounts_connection_status_idx on public.provider_accounts (connection_status);
create index if not exists provider_accounts_archive_enabled_idx on public.provider_accounts (archive_enabled);
create index if not exists provider_accounts_deleted_at_idx on public.provider_accounts (deleted_at);

alter table public.provider_accounts enable row level security;

create policy "provider_accounts_select_own"
on public.provider_accounts
for select
to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy "provider_accounts_insert_own"
on public.provider_accounts
for insert
to authenticated
with check (profile_id = auth.uid() and deleted_at is null);

create policy "provider_accounts_update_own"
on public.provider_accounts
for update
to authenticated
using (profile_id = auth.uid() and deleted_at is null)
with check (profile_id = auth.uid());

grant select, insert, update on public.provider_accounts to authenticated;
grant select, insert, update on public.provider_accounts to service_role;

create trigger set_provider_accounts_updated_at
before update on public.provider_accounts
for each row execute function private.set_updated_at();

-- oauth_tokens (private schema)
create table if not exists private.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider_account_id uuid not null references public.provider_accounts (id) on delete cascade unique,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_type text not null default 'Bearer',
  granted_scopes text not null,
  expires_at timestamptz not null,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oauth_tokens_profile_id_idx on private.oauth_tokens (profile_id);
create index if not exists oauth_tokens_expires_at_idx on private.oauth_tokens (expires_at);
create index if not exists oauth_tokens_revoked_at_idx on private.oauth_tokens (revoked_at);
create index if not exists oauth_tokens_provider_account_id_idx on private.oauth_tokens (provider_account_id);

revoke all on table private.oauth_tokens from public;
revoke all on table private.oauth_tokens from anon;
revoke all on table private.oauth_tokens from authenticated;
grant select, insert, update, delete on table private.oauth_tokens to service_role;

alter table private.oauth_tokens enable row level security;

create policy "oauth_tokens_service_role_select"
on private.oauth_tokens
for select
to service_role
using (true);

create policy "oauth_tokens_service_role_insert"
on private.oauth_tokens
for insert
to service_role
with check (true);

create policy "oauth_tokens_service_role_update"
on private.oauth_tokens
for update
to service_role
using (true)
with check (true);

create policy "oauth_tokens_service_role_delete"
on private.oauth_tokens
for delete
to service_role
using (true);

create trigger set_oauth_tokens_updated_at
before update on private.oauth_tokens
for each row execute function private.set_updated_at();

-- recordings
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  source_call_code text,
  source_room_name text,
  storage_bucket text not null default 'recordings',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  checksum_sha256 text,
  status text not null default 'initializing' check (status in ('initializing', 'recording', 'stopping', 'finalized', 'failed')),
  started_at timestamptz,
  finalized_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recordings_profile_id_idx on public.recordings (profile_id);
create index if not exists recordings_status_idx on public.recordings (status);
create index if not exists recordings_created_at_idx on public.recordings (created_at);
create index if not exists recordings_deleted_at_idx on public.recordings (deleted_at);

alter table public.recordings enable row level security;

create policy "recordings_select_own"
on public.recordings
for select
to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy "recordings_insert_own"
on public.recordings
for insert
to authenticated
with check (profile_id = auth.uid() and deleted_at is null);

create policy "recordings_update_own"
on public.recordings
for update
to authenticated
using (profile_id = auth.uid() and deleted_at is null)
with check (profile_id = auth.uid());

grant select, insert, update on public.recordings to authenticated;
grant select, insert, update on public.recordings to service_role;

create trigger set_recordings_updated_at
before update on public.recordings
for each row execute function private.set_updated_at();

-- archive_runs
create table if not exists public.archive_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  recording_id uuid not null references public.recordings (id) on delete cascade,
  provider_account_id uuid not null references public.provider_accounts (id) on delete restrict,
  archive_provider_id uuid not null references public.archive_providers (id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'validating_auth', 'checking_provider', 'uploading', 'processing', 'archived', 'blocked_onboarding', 'needs_reconnect', 'failed', 'retry_pending')),
  attempt_number integer not null default 1 check (attempt_number >= 1),
  source_file_size_bytes bigint not null check (source_file_size_bytes > 0),
  source_duration_seconds integer not null check (source_duration_seconds >= 0),
  provider_archive_id text,
  provider_url text,
  provider_playback_url text,
  provider_thumbnail_url text,
  provider_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  retry_of_archive_run_id uuid references public.archive_runs (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists archive_runs_profile_id_idx on public.archive_runs (profile_id);
create index if not exists archive_runs_recording_id_idx on public.archive_runs (recording_id);
create index if not exists archive_runs_provider_account_id_idx on public.archive_runs (provider_account_id);
create index if not exists archive_runs_archive_provider_id_idx on public.archive_runs (archive_provider_id);
create index if not exists archive_runs_status_idx on public.archive_runs (status);
create index if not exists archive_runs_created_at_idx on public.archive_runs (created_at);
create index if not exists archive_runs_deleted_at_idx on public.archive_runs (deleted_at);

alter table public.archive_runs enable row level security;

create policy "archive_runs_select_own"
on public.archive_runs
for select
to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy "archive_runs_insert_own"
on public.archive_runs
for insert
to authenticated
with check (profile_id = auth.uid() and deleted_at is null);

create policy "archive_runs_update_own"
on public.archive_runs
for update
to authenticated
using (profile_id = auth.uid() and deleted_at is null)
with check (profile_id = auth.uid());

grant select, insert, update on public.archive_runs to authenticated;
grant select, insert, update on public.archive_runs to service_role;

create trigger set_archive_runs_updated_at
before update on public.archive_runs
for each row execute function private.set_updated_at();

-- memories
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  recording_id uuid not null unique references public.recordings (id) on delete restrict,
  archive_run_id uuid not null unique references public.archive_runs (id) on delete restrict,
  title text not null,
  description text,
  memory_source text not null check (memory_source in ('call', 'manual_upload', 'future_photo', 'future_audio_note', 'future_import')),
  processing_status text not null default 'preparing' check (processing_status in ('preparing', 'uploading', 'archived', 'transcribing', 'summarizing', 'ready', 'failed')),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_profile_id_idx on public.memories (profile_id);
create index if not exists memories_processing_status_idx on public.memories (processing_status);
create index if not exists memories_archived_at_idx on public.memories (archived_at);
create index if not exists memories_created_at_idx on public.memories (created_at);
create index if not exists memories_deleted_at_idx on public.memories (deleted_at);

alter table public.memories enable row level security;

create policy "memories_select_own"
on public.memories
for select
to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy "memories_insert_own"
on public.memories
for insert
to authenticated
with check (profile_id = auth.uid() and deleted_at is null);

create policy "memories_update_own"
on public.memories
for update
to authenticated
using (profile_id = auth.uid() and deleted_at is null)
with check (profile_id = auth.uid());

grant select, insert, update on public.memories to authenticated;
grant select, insert, update on public.memories to service_role;

create trigger set_memories_updated_at
before update on public.memories
for each row execute function private.set_updated_at();

-- memory_assets
create table if not exists public.memory_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  memory_id uuid not null references public.memories (id) on delete cascade,
  asset_kind text not null check (asset_kind in ('video', 'thumbnail', 'transcript', 'summary', 'attachment', 'embedding_index')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  checksum_sha256 text,
  language_code text,
  content_text text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists memory_assets_unique_active_idx
on public.memory_assets (memory_id, asset_kind, storage_path)
where deleted_at is null;
create index if not exists memory_assets_profile_id_idx on public.memory_assets (profile_id);
create index if not exists memory_assets_memory_id_idx on public.memory_assets (memory_id);
create index if not exists memory_assets_asset_kind_idx on public.memory_assets (asset_kind);
create index if not exists memory_assets_created_at_idx on public.memory_assets (created_at);
create index if not exists memory_assets_deleted_at_idx on public.memory_assets (deleted_at);

alter table public.memory_assets enable row level security;

create policy "memory_assets_select_own"
on public.memory_assets
for select
to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy "memory_assets_insert_own"
on public.memory_assets
for insert
to authenticated
with check (profile_id = auth.uid() and deleted_at is null);

create policy "memory_assets_update_own"
on public.memory_assets
for update
to authenticated
using (profile_id = auth.uid() and deleted_at is null)
with check (profile_id = auth.uid());

grant select, insert, update on public.memory_assets to authenticated;
grant select, insert, update on public.memory_assets to service_role;

create trigger set_memory_assets_updated_at
before update on public.memory_assets
for each row execute function private.set_updated_at();

