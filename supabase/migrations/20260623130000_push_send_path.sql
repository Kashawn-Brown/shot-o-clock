-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Push send path: send_push_to_users helper (pg_net → Expo)
-- ─────────────────────────────────────────────────────────────────────────────
-- The server-side delivery primitive for push (#009 / D063): given a set of users,
-- look up their stored Expo push tokens (devices) and POST a notification to Expo's
-- push service. Expo forwards to FCM/APNs using the credentials configured on the
-- Expo project. Outbound HTTP is done with pg_net (net.http_post), keeping delivery
-- inside the Postgres/pg_cron architecture the rest of the game logic already uses
-- (see decisions.md D068 — push send via pg_net, not an Edge Function).
--
-- This migration builds ONLY the delivery primitive. The per-event senders (the 10
-- #009 triggers, and moving Shot O'Clock/Heads-up onto push) are wired in follow-up
-- work that computes the recipients + copy and calls this helper.
--
-- Internal helper: EXECUTE revoked from all API roles (anon, authenticated) like the
-- other server-only functions; only owner / SECURITY DEFINER callers invoke it.
--
-- Known deferrals (refinements, not blockers): reading Expo's response from
-- net._http_response to prune DeviceNotRegistered tokens, and chunking when a single
-- call would exceed Expo's 100-messages-per-request limit (our party sizes are far
-- below it). Both can be added later without changing this signature.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_net for outbound HTTP from Postgres (idempotent; matches the pg_cron enable
-- convention in 20260616120000). Already present on Supabase, but declared so a
-- fresh DB has it.
create extension if not exists pg_net;


create or replace function public.send_push_to_users(
  p_user_ids uuid[],
  p_title    text,
  p_body     text,
  p_data     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_messages jsonb;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  -- One Expo message per stored token for these users (a user has at most one row
  -- under anon auth; the array form still covers multi-recipient events).
  select jsonb_agg(
           jsonb_build_object(
             'to',       d.expo_push_token,
             'title',    p_title,
             'body',     p_body,
             'data',     coalesce(p_data, '{}'::jsonb),
             'sound',    'default',
             'priority', 'high'
           )
         )
    into v_messages
  from devices d
  where d.user_id = any (p_user_ids);

  -- No registered tokens for any recipient → nothing to send.
  if v_messages is null then
    return;
  end if;

  -- Fire-and-forget POST (async; pg_net stores the response in net._http_response,
  -- which we don't read yet — see deferrals above). Expo accepts a single message
  -- object or an array; we always send an array.
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept',       'application/json'
    ),
    body    := v_messages
  );
end;
$$;

comment on function public.send_push_to_users(uuid[], text, text, jsonb) is
  'Push delivery primitive: resolves user_ids -> Expo push tokens (devices) and '
  'POSTs a notification to Expo via pg_net. Internal; EXECUTE revoked from API '
  'roles. Phase 16; see #009, D063, D068.';

revoke execute on function public.send_push_to_users(uuid[], text, text, jsonb)
  from public, anon, authenticated;
