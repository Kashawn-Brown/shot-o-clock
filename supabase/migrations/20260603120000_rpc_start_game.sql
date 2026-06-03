-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch C1: start_game RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- The lobby → countdown transition from docs/specs/rpc-contracts.md §5:
--   - start_game(party_session_id)  — host starts the game, creating round 1
--
-- Follows the locked conventions from docs/KNOWN_ISSUES.md #D010:
--   (1) SECURITY DEFINER with SET search_path = public, pg_temp
--   (2) In-function auth.uid() check before any write
--   (4) Standard {ok, error_code, error_msg, data} return shape via the
--       _rpc_success / _rpc_error helpers (20260513150000_rpc_infrastructure.sql)
--
-- Batch C1 conventions (approved this session):
--   (A) Not-found / non-member / non-host all collapse into NOT_HOST. §5.5
--       lists only NOT_HOST / ILLEGAL_TRANSITION / NO_ACTIVE_PLAYERS — it
--       deliberately omits SESSION_NOT_FOUND (unlike end_party §12). NOT_HOST
--       is the non-leaking answer for a foreign / nonexistent session id.
--   (B) rounds.shot_window_seconds is populated from party_settings. The schema
--       makes the column NOT NULL (> 0); §5.4 step 1 omits it, so we pull it
--       here explicitly. (Note the spec omission.)
--   (C) The countdown_started timer_events row carries the descriptive columns
--       previous_phase / new_phase / new_ends_at beyond §5.4's minimal set, for
--       the timeline-reconstruction use case (schema.md §8 notes).
--
-- rounds.referee_confirmation_window_seconds is left to its schema default (0)
-- rather than pulled from party_settings: referees are post-MVP and every MVP
-- party has referee_confirmation_window_seconds = 0 in settings, so the default
-- and the settings value are identical. Pulling it would falsely imply MVP
-- cares about the referee window.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── start_game ───────────────────────────────────────────────────────────────
-- See rpc-contracts.md §5 and mvp-state-machine.md §3.1→§3.2 / §5.
--
-- SELECT … FOR UPDATE on the party_sessions row serializes us against a
-- concurrent join_party / end_party and against a second start_game from
-- another host tab. The second start_game blocks until the first commits, then
-- observes active/countdown/round=1 and returns the idempotent ok (§5.6). The
-- rounds (party_session_id, round_number) unique constraint is the DB-level
-- safety net behind that function-level check.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_HOST if not found (convention A)
--   4. caller's party_players row + host check → NOT_HOST
--   5. idempotent re-entry (already active/countdown/round=1) → ok + round 1
--   6. lobby/lobby check → ILLEGAL_TRANSITION otherwise
--   7. active-player count → NO_ACTIVE_PLAYERS if zero
--   8. effects: insert round 1, update session, insert timer_events

create or replace function public.start_game(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id          uuid := auth.uid();
  v_session          party_sessions%rowtype;
  v_player_id        uuid;
  v_role             player_permission_role;
  v_active_count     int;
  v_starting_interval int;
  v_shot_window      int;
  v_round_id         uuid;
  v_phase_ends_at    timestamptz;
  v_now              timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  select * into v_session
  from party_sessions
  where id = p_party_session_id
  for update;

  -- Convention A: a foreign / nonexistent session collapses into NOT_HOST. §5.5
  -- omits SESSION_NOT_FOUND; NOT_HOST is true ("you are not its host") and does
  -- not leak session existence to a non-member.
  if not found then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  select id, permission_role
    into v_player_id, v_role
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_player_id is null or v_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  -- §5.6 — narrow idempotency: this exact start_game already ran. Return the
  -- existing round 1 with the session's current phase_ends_at; do NOT re-create.
  if v_session.status = 'active'
     and v_session.current_phase = 'countdown'
     and v_session.current_round_number = 1 then
    select id into v_round_id
    from rounds
    where party_session_id = p_party_session_id
      and round_number = 1;

    return public._rpc_success(jsonb_build_object(
      'round_id',      v_round_id,
      'round_number',  1,
      'phase_ends_at', v_session.phase_ends_at
    ));
  end if;

  -- §5.3 — any other non-lobby state is an illegal start (already past lobby,
  -- mid-game, or ended). The idempotent case above is the only exception.
  if v_session.status != 'lobby' or v_session.current_phase != 'lobby' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'The game cannot be started from its current state.');
  end if;

  -- §5.3 — need at least one active player (the host counts).
  select count(*) into v_active_count
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_active_count = 0 then
    return public._rpc_error('NO_ACTIVE_PLAYERS',
      'The game needs at least one active player to start.');
  end if;

  -- §5.4 effects — single transaction. starting_interval drives the countdown;
  -- shot_window is pulled per convention B (schema requires rounds
  -- .shot_window_seconds NOT NULL; the spec text omits it).
  select starting_interval_seconds, shot_window_seconds
    into v_starting_interval, v_shot_window
  from party_settings
  where party_session_id = p_party_session_id;

  v_phase_ends_at := v_now + make_interval(secs => v_starting_interval);

  -- Round 1. referee_confirmation_window_seconds intentionally omitted — takes
  -- the schema default (0); see header note.
  insert into rounds (
    party_session_id,
    round_number,
    interval_seconds,
    shot_window_seconds,
    status,
    countdown_started_at,
    countdown_ends_at
  )
  values (
    p_party_session_id,
    1,
    v_starting_interval,
    v_shot_window,
    'countdown',
    v_now,
    v_phase_ends_at
  )
  returning id into v_round_id;

  update party_sessions
  set status               = 'active',
      current_phase        = 'countdown',
      current_round_number = 1,
      phase_started_at     = v_now,
      phase_ends_at        = v_phase_ends_at,
      started_at           = v_now
  where id = p_party_session_id;

  -- §5.4 step 3 — countdown_started event. triggered_by = host. Descriptive
  -- columns populated per convention C.
  insert into timer_events (
    party_session_id,
    round_id,
    round_number,
    event_type,
    previous_phase,
    new_phase,
    new_ends_at,
    triggered_by,
    triggered_by_player_id
  )
  values (
    p_party_session_id,
    v_round_id,
    1,
    'countdown_started',
    'lobby',
    'countdown',
    v_phase_ends_at,
    'host',
    v_player_id
  );

  return public._rpc_success(jsonb_build_object(
    'round_id',      v_round_id,
    'round_number',  1,
    'phase_ends_at', v_phase_ends_at
  ));
end;
$$;

comment on function public.start_game(uuid) is
  'Host starts the game: lobby → countdown, creating round 1. '
  'See docs/specs/rpc-contracts.md §5 and docs/KNOWN_ISSUES.md #D010.';
