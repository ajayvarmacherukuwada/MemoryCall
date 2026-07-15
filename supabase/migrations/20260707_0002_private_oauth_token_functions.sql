create or replace function public.get_private_oauth_token(p_provider_account_id uuid)
returns table (
  id uuid,
  profile_id uuid,
  provider_account_id uuid,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_type text,
  granted_scopes text,
  expires_at timestamptz,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, private, pg_catalog
as $$
  select
    t.id,
    t.profile_id,
    t.provider_account_id,
    t.access_token_encrypted,
    t.refresh_token_encrypted,
    t.token_type,
    t.granted_scopes,
    t.expires_at,
    t.last_refreshed_at,
    t.revoked_at,
    t.created_at,
    t.updated_at
  from private.oauth_tokens as t
  where t.provider_account_id = p_provider_account_id
  limit 1;
$$;

create or replace function public.upsert_private_oauth_token(
  p_profile_id uuid,
  p_provider_account_id uuid,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_token_type text,
  p_granted_scopes text,
  p_expires_at timestamptz,
  p_last_refreshed_at timestamptz default now(),
  p_revoked_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  insert into private.oauth_tokens (
    profile_id,
    provider_account_id,
    access_token_encrypted,
    refresh_token_encrypted,
    token_type,
    granted_scopes,
    expires_at,
    last_refreshed_at,
    revoked_at
  )
  values (
    p_profile_id,
    p_provider_account_id,
    p_access_token_encrypted,
    p_refresh_token_encrypted,
    p_token_type,
    p_granted_scopes,
    p_expires_at,
    p_last_refreshed_at,
    p_revoked_at
  )
  on conflict (provider_account_id) do update
  set
    profile_id = excluded.profile_id,
    access_token_encrypted = excluded.access_token_encrypted,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    token_type = excluded.token_type,
    granted_scopes = excluded.granted_scopes,
    expires_at = excluded.expires_at,
    last_refreshed_at = excluded.last_refreshed_at,
    revoked_at = excluded.revoked_at;
end;
$$;

create or replace function public.mark_private_oauth_token_revoked(
  p_provider_account_id uuid,
  p_revoked_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  update private.oauth_tokens
  set revoked_at = coalesce(p_revoked_at, now())
  where provider_account_id = p_provider_account_id;
end;
$$;

revoke all on function public.get_private_oauth_token(uuid) from public;
revoke all on function public.get_private_oauth_token(uuid) from anon;
revoke all on function public.get_private_oauth_token(uuid) from authenticated;
grant execute on function public.get_private_oauth_token(uuid) to service_role;

revoke all on function public.upsert_private_oauth_token(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.upsert_private_oauth_token(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) from anon;
revoke all on function public.upsert_private_oauth_token(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) from authenticated;
grant execute on function public.upsert_private_oauth_token(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;

revoke all on function public.mark_private_oauth_token_revoked(uuid, timestamptz) from public;
revoke all on function public.mark_private_oauth_token_revoked(uuid, timestamptz) from anon;
revoke all on function public.mark_private_oauth_token_revoked(uuid, timestamptz) from authenticated;
grant execute on function public.mark_private_oauth_token_revoked(uuid, timestamptz) to service_role;
