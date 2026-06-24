-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Push token storage: devices table + register_push_token RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- Activates the `devices` table reserved in schema.md §10 / enums.md §3.18 for
-- push-token tracking. Each row is one device's Expo push token — the address the
-- server-side push send path (#009 / D063) uses to reach a backgrounded/locked
-- device. Client never writes here directly (CLAUDE.md §2.2/§2.5); it calls
-- register_push_token, which runs SECURITY DEFINER.
--
-- Locked conventions (#D010): SECURITY DEFINER + SET search_path = public, pg_temp,
-- in-function auth.uid() check, standard {ok,...} envelope via _rpc_success/_error.
--
-- Identity model: under Supabase Anonymous Auth one auth user == one physical
-- device == one token, so we keep exactly one device row per user (the RPC prunes
-- the caller's other rows after a token rotation). Accounts-era multi-device
-- (post-prod) revisits this — see the comment in register_push_token.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Table ────────────────────────────────────────────────────────────────────
create table if not exists devices (
  id              uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE (not RESTRICT like party_players): a token has no historical
  -- value, so it should disappear with the auth user, never block the user's deletion.
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Unique on the token itself: a physical device's token belongs to exactly one
  -- identity — the most recent registrant (handles device-reset reclaim, below).
  expo_push_token text not null unique check (char_length(expo_push_token) between 1 and 255),
  platform        device_platform,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_devices_user_id on devices (user_id);

drop trigger if exists set_updated_at_devices on devices;
create trigger set_updated_at_devices
  before update on devices
  for each row
  execute function public.set_updated_at();


-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Read-only for the owner; no write policies — all writes flow through the
-- SECURITY DEFINER RPC. The send path reads as the table owner (postgres, via the
-- cron sweep), which bypasses RLS. (select auth.uid()) per the initplan convention.
alter table devices enable row level security;

drop policy if exists "read your own devices" on devices;
create policy "read your own devices"
on devices for select
to authenticated
using (user_id = (select auth.uid()));


-- ─── register_push_token RPC ──────────────────────────────────────────────────
create or replace function public.register_push_token(
  p_expo_push_token text,
  p_platform device_platform default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_device_id uuid;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_expo_push_token is null or char_length(trim(p_expo_push_token)) = 0 then
    return public._rpc_error('INVALID_PARAM', 'p_expo_push_token is required.');
  end if;

  -- Claim the token for the caller. ON CONFLICT covers both re-registration of an
  -- unchanged token (every launch — just bumps updated_at) and reclaim after a
  -- "Reset this device": the same physical token now belongs to a new anonymous
  -- identity, so the row's user_id is reassigned to the current caller.
  insert into devices (user_id, expo_push_token, platform)
  values (v_user_id, trim(p_expo_push_token), p_platform)
  on conflict (expo_push_token) do update
    set user_id    = excluded.user_id,
        platform   = coalesce(excluded.platform, devices.platform),
        updated_at = now()
  returning id into v_device_id;

  -- One token per identity (anon auth: user == device). Drop the caller's other
  -- rows left behind by a rotated token so a stale token can't keep receiving this
  -- user's pushes. Accounts-era multi-device would replace this with per-device rows.
  delete from devices
  where user_id = v_user_id
    and id <> v_device_id;

  return public._rpc_success(jsonb_build_object('device_id', v_device_id));
end;
$$;

comment on function public.register_push_token(text, device_platform) is
  'Upserts the caller''s Expo push token into devices (one row per user under '
  'anonymous auth). Reassigns a token to the caller on device-reset reclaim and '
  'prunes the caller''s stale rotated tokens. Phase 16; see #009, D063.';
