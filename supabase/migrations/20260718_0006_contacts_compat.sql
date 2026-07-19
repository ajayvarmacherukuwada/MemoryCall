alter table public.contacts
  add column if not exists nickname text,
  add column if not exists last_verified_at timestamptz;

create index if not exists contacts_last_verified_at_idx
on public.contacts (last_verified_at);
