create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  call_id text not null unique,
  creator_profile_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  callee_profile_id uuid references public.profiles (id) on delete set null,
  mode text not null default 'video' check (mode in ('video', 'audio')),
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled', 'failed')),
  message_count integer not null default 0 check (message_count >= 0),
  next_sequence integer not null default 1 check (next_sequence >= 1),
  last_signal_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_sessions_call_id_idx on public.call_sessions (call_id);
create index if not exists call_sessions_creator_profile_id_idx on public.call_sessions (creator_profile_id);
create index if not exists call_sessions_callee_profile_id_idx on public.call_sessions (callee_profile_id);
create index if not exists call_sessions_status_idx on public.call_sessions (status);
create index if not exists call_sessions_deleted_at_idx on public.call_sessions (deleted_at);

alter table public.call_sessions enable row level security;

create policy "call_sessions_select_participants"
on public.call_sessions
for select
to authenticated
using ((creator_profile_id = auth.uid() or callee_profile_id = auth.uid()) and deleted_at is null);

create policy "call_sessions_insert_creator"
on public.call_sessions
for insert
to authenticated
with check (creator_profile_id = auth.uid() and deleted_at is null);

create policy "call_sessions_update_participants"
on public.call_sessions
for update
to authenticated
using ((creator_profile_id = auth.uid() or callee_profile_id = auth.uid()) and deleted_at is null)
with check (creator_profile_id = auth.uid() or callee_profile_id = auth.uid());

grant select, insert, update, delete on public.call_sessions to authenticated;
grant select, insert, update, delete on public.call_sessions to service_role;

create trigger set_call_sessions_updated_at
before update on public.call_sessions
for each row execute function private.set_updated_at();
