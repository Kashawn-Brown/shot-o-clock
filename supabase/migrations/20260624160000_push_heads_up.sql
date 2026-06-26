-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Step 1b: Heads-up on server push (party-wide, host-controlled)
-- ─────────────────────────────────────────────────────────────────────────────
-- Moves the Heads-up (pre-warning) from device-local scheduling to server push
-- (D063). It becomes a host-controlled, party-wide setting on party_settings — the
-- cron reads it live and pushes, so it's correct across pause/add-time with no client
-- awake. Reuses the reserved party_settings.pre_shot_warning_* columns (already
-- returned by get_party_state). The local Heads-up scheduler is deleted client-side.
--
-- The host control has two abuse gates (host_set_heads_up): once-per-round, and a
-- fire-window lock that blocks any change while this round's Heads-up is about to send.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Defaults: a new party is Heads-up ON / 2 min, with no create-time input.
--    create_party doesn't set these columns, so these defaults apply automatically.
alter table party_settings alter column pre_shot_warning_enabled set default true;
alter table party_settings alter column pre_shot_warning_seconds set default 120;

-- 2. Per-round flags (both reset naturally each round — new round row, null):
--    - heads_up_push_sent_at: once-per-round send guard for the cron.
--    - heads_up_setting_changed_at: once-per-round host-change guard (gate 1).
alter table rounds add column if not exists heads_up_push_sent_at timestamptz;
alter table rounds add column if not exists heads_up_setting_changed_at timestamptz;

-- 3. host_set_heads_up — host-only live control (party-wide), with both gates.
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

  -- Lock the session row so rapid taps serialize against the gate checks below.
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

  -- Idempotent no-op: requested == current → ok, consumes NEITHER gate (a UI
  -- re-render re-submitting the same values is free).
  if v_cur_enabled = p_enabled and v_cur_lead = p_lead_seconds then
    return public._rpc_success(jsonb_build_object(
      'heads_up_enabled', v_cur_enabled,
      'heads_up_lead_seconds', v_cur_lead
    ));
  end if;

  -- The current round (none in lobby → both gates skip).
  select id, heads_up_setting_changed_at, heads_up_push_sent_at
    into v_round_id, v_round_changed_at, v_round_sent_at
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- ── GATE 2 — fire-window lock (checked before gate 1) ──────────────────────
  -- Heads-up currently ENABLED and this round's send is due (in the lead window,
  -- lead fits the countdown) but hasn't gone out yet → locked. Only reachable from
  -- an enabled state, so it only ever blocks a disable or a lead change — the
  -- "silence it as it's about to warn everyone" case.
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

  update party_settings
  set pre_shot_warning_enabled = p_enabled,
      pre_shot_warning_seconds = p_lead_seconds
  where party_session_id = p_party_session_id;

  if v_round_id is not null then
    update rounds set heads_up_setting_changed_at = v_now where id = v_round_id;
  end if;

  return public._rpc_success(jsonb_build_object(
    'heads_up_enabled', p_enabled,
    'heads_up_lead_seconds', p_lead_seconds
  ));
end;
$$;

comment on function public.host_set_heads_up(uuid, boolean, int) is
  'Host sets the party-wide Heads-up on/off + lead (60/120/300s) on party_settings; '
  'the cron send path reads it live. Gates: once-per-round (HEADS_UP_ALREADY_CHANGED) '
  'and a fire-window lock (HEADS_UP_LOCKED). Phase 16; #009, D063.';

-- 4. send_heads_up_push — to the active players.
create or replace function public.send_heads_up_push(p_party_session_id uuid, p_lead_seconds int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_number int;
  v_user_ids     uuid[];
  v_minutes      int := p_lead_seconds / 60;
begin
  select current_round_number into v_round_number
  from party_sessions where id = p_party_session_id;

  select array_agg(user_id) into v_user_ids
  from party_players where party_session_id = p_party_session_id and status = 'active';

  if v_user_ids is null then return; end if;

  perform public.send_push_to_users(
    v_user_ids,
    'Shot O''Clock soon',
    format('Get ready, the next shot is in %s %s.',
           v_minutes, case when v_minutes = 1 then 'minute' else 'minutes' end),
    jsonb_build_object('type', 'shot_window_prewarn', 'partySessionId', p_party_session_id,
                       'roundNumber', v_round_number, 'leadMinutes', v_minutes)
  );
end;
$$;

comment on function public.send_heads_up_push(uuid, int) is
  'Sends the Heads-up push to the active players. Internal; EXECUTE revoked. Phase 16.';
revoke execute on function public.send_heads_up_push(uuid, int) from public, anon, authenticated;

-- 5. cron_send_heads_up_pushes — sweep approaching countdowns every 5s.
create or replace function public.cron_send_heads_up_pushes()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_round_id   uuid;
  v_lead       int;
  v_count      int := 0;
begin
  for v_session_id, v_round_id, v_lead in
    select s.id, r.id, ps.pre_shot_warning_seconds
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
      -- lead fits inside the countdown (handles add-time); else it'd fire at/before start.
      and s.phase_ends_at - make_interval(secs => ps.pre_shot_warning_seconds) > s.phase_started_at
    for update of s skip locked
  loop
    update rounds set heads_up_push_sent_at = now() where id = v_round_id;
    perform public.send_heads_up_push(v_session_id, v_lead);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.cron_send_heads_up_pushes() is
  'Every 5s: sends the Heads-up push for active countdowns within their lead window '
  '(once per round via rounds.heads_up_push_sent_at). EXECUTE revoked; pg_cron only.';
revoke execute on function public.cron_send_heads_up_pushes() from public, anon, authenticated;

select cron.schedule(
  'send-heads-up-pushes',
  '5 seconds',
  $cron$select public.cron_send_heads_up_pushes();$cron$
);
