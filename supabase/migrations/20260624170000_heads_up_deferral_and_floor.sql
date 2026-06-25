-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Heads-up: late-change deferral + cron near-zero floor
-- ─────────────────────────────────────────────────────────────────────────────
-- Two refinements to the Step 1b Heads-up push (20260624160000):
--
-- 1. host_set_heads_up — DEFERRAL. After saving the new setting, if it can't still
--    fire this round (the round already sent its Heads-up, or the new lead's entry
--    point is already past), suppress this round via heads_up_push_sent_at and return
--    deferred=true so the client can tell the host it starts next round. The change
--    still consumes the once-per-round gate (heads_up_setting_changed_at is set in
--    the apply) — deferral is not a free pass.
--
-- 2. cron_send_heads_up_pushes — 30s FLOOR. A defensive backstop independent of (1):
--    if under 30s remain at send-evaluation, mark sent without sending rather than
--    fire a near-zero "warning".
--
-- Both functions reproduced VERBATIM from 20260624160000 with only the marked
-- additions. Locked conventions (#D010) unchanged; REVOKEs re-asserted.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.host_set_heads_up(
  p_party_session_id uuid,
  p_enabled          boolean,
  p_lead_seconds     int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id          uuid := auth.uid();
  v_role             player_permission_role;
  v_session          party_sessions%rowtype;
  v_cur_enabled      boolean;
  v_cur_lead         int;
  v_round_id         uuid;
  v_round_changed_at timestamptz;
  v_round_sent_at    timestamptz;
  v_deferred         boolean := false;
  v_now              timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_enabled is null or p_lead_seconds is null then
    return public._rpc_error('INVALID_PARAM', 'p_enabled and p_lead_seconds are required.');
  end if;
  if p_lead_seconds not in (60, 120, 300) then
    return public._rpc_error('INVALID_PARAM', 'p_lead_seconds must be 60, 120, or 300.');
  end if;

  select * into v_session
  from party_sessions
  where id = p_party_session_id
  for update;

  if not found then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  select permission_role into v_role
  from party_players
  where party_session_id = p_party_session_id and user_id = v_user_id;

  if v_role is null or v_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  select pre_shot_warning_enabled, pre_shot_warning_seconds
    into v_cur_enabled, v_cur_lead
  from party_settings
  where party_session_id = p_party_session_id;

  -- Idempotent no-op: requested == current → ok, consumes NEITHER gate.
  if v_cur_enabled = p_enabled and v_cur_lead = p_lead_seconds then
    return public._rpc_success(jsonb_build_object(
      'heads_up_enabled', v_cur_enabled,
      'heads_up_lead_seconds', v_cur_lead,
      'deferred', false
    ));
  end if;

  select id, heads_up_setting_changed_at, heads_up_push_sent_at
    into v_round_id, v_round_changed_at, v_round_sent_at
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- ── GATE 2 — fire-window lock (checked before gate 1) ──────────────────────
  if v_round_id is not null
     and v_cur_enabled
     and v_session.status = 'active'
     and v_session.current_phase = 'countdown'
     and v_session.phase_ends_at is not null
     and v_round_sent_at is null
     and v_now >= v_session.phase_ends_at - make_interval(secs => v_cur_lead)
     and v_now <  v_session.phase_ends_at
     and v_session.phase_ends_at - make_interval(secs => v_cur_lead) > v_session.phase_started_at
  then
    return public._rpc_error('HEADS_UP_LOCKED',
      'The next Heads-up is about to send — you can''t change it now. Try again after this round''s shot.');
  end if;

  -- ── GATE 1 — once per round ────────────────────────────────────────────────
  if v_round_id is not null and v_round_changed_at is not null then
    return public._rpc_error('HEADS_UP_ALREADY_CHANGED',
      'You can only change Heads-up once per round. Try again next round.');
  end if;

  -- Apply + consume the once-per-round gate.
  update party_settings
  set pre_shot_warning_enabled = p_enabled,
      pre_shot_warning_seconds = p_lead_seconds
  where party_session_id = p_party_session_id;

  if v_round_id is not null then
    update rounds set heads_up_setting_changed_at = v_now where id = v_round_id;
  end if;

  -- ── DEFERRAL — can the new setting still fire this round? ───────────────────
  -- It can't if the round already sent its Heads-up, or the new lead's entry point
  -- (phase_ends_at - new lead) is already past. Suppress this round via the send flag
  -- and report deferred so the host is told it starts next round. (Still counts as the
  -- round's one change — heads_up_setting_changed_at was set above.)
  if p_enabled
     and v_round_id is not null
     and v_session.status = 'active'
     and v_session.current_phase = 'countdown'
     and v_session.phase_ends_at is not null
     and ( v_round_sent_at is not null
           or v_now >= v_session.phase_ends_at - make_interval(secs => p_lead_seconds) )
  then
    v_deferred := true;
    if v_round_sent_at is null then
      update rounds set heads_up_push_sent_at = v_now where id = v_round_id;
    end if;
  end if;

  return public._rpc_success(jsonb_build_object(
    'heads_up_enabled', p_enabled,
    'heads_up_lead_seconds', p_lead_seconds,
    'deferred', v_deferred
  ));
end;
$$;

comment on function public.host_set_heads_up(uuid, boolean, int) is
  'Host sets the party-wide Heads-up on/off + lead (60/120/300s); the cron reads it '
  'live. Gates: once-per-round (HEADS_UP_ALREADY_CHANGED) + fire-window lock '
  '(HEADS_UP_LOCKED). A change too late for this round is saved + deferred=true '
  '(suppressed this round). Phase 16; #009, D063, D070.';


-- cron_send_heads_up_pushes — verbatim from 20260624160000 + the 30s floor.
create or replace function public.cron_send_heads_up_pushes()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id    uuid;
  v_round_id      uuid;
  v_lead          int;
  v_phase_ends_at timestamptz;
  v_count         int := 0;
begin
  for v_session_id, v_round_id, v_lead, v_phase_ends_at in
    select s.id, r.id, ps.pre_shot_warning_seconds, s.phase_ends_at
    from party_sessions s
    join party_settings ps on ps.party_session_id = s.id
    join rounds r on r.party_session_id = s.id and r.round_number = s.current_round_number
    where s.status = 'active'
      and s.current_phase = 'countdown'
      and ps.pre_shot_warning_enabled
      and s.phase_ends_at is not null
      and s.phase_started_at is not null
      and r.heads_up_push_sent_at is null
      and now() >= s.phase_ends_at - make_interval(secs => ps.pre_shot_warning_seconds)
      and now() < s.phase_ends_at
      and s.phase_ends_at - make_interval(secs => ps.pre_shot_warning_seconds) > s.phase_started_at
    for update of s skip locked
  loop
    -- Mark sent either way (once-per-round). Floor: don't fire a near-zero warning —
    -- if under 30s remain at send-evaluation, suppress (already marked sent).
    update rounds set heads_up_push_sent_at = now() where id = v_round_id;
    if v_phase_ends_at - now() >= interval '30 seconds' then
      perform public.send_heads_up_push(v_session_id, v_lead);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

comment on function public.cron_send_heads_up_pushes() is
  'Every 5s: sends the Heads-up push for active countdowns within their lead window '
  '(once per round via rounds.heads_up_push_sent_at). Suppresses under a 30s floor. '
  'EXECUTE revoked; pg_cron only.';
revoke execute on function public.cron_send_heads_up_pushes() from public, anon, authenticated;
