-- ─────────────────────────────────────────────────────────────────────────────
-- Fix — mark_self_left makes a leaver a hard OUT, not a grace-aware skip
-- ─────────────────────────────────────────────────────────────────────────────
-- BUG: a player who left mid-game was still counted active. mark_self_left only
-- stamped left_at and left status = 'active'; the client's accompanying
-- mark_self_out is a grace-aware skip (D034), so with elimination off / grace it was
-- ABSORBED and the player stayed active. Every "active" check keys on
-- status = 'active' (finalize loop, v_active_after, finalize_if_all_submitted,
-- the countdown open-check, advance_to_next_round), so the leaver was marked Missed
-- every round and blocked the all-answered early-finalize / auto-advance.
--
-- FIX: leaving is a departure, not a skip — mark_self_left now also marks the caller
-- OUT (out_reason self_opted_out, out_round_number = current, out_at = now) when
-- they're a mid-game active player, then runs finalize_if_all_submitted so the last
-- remaining active player leaving completes the round. With status = 'out', every
-- existing active check excludes them automatically — no change to the finalize /
-- advance functions. The "Left" label is unaffected: the roster (deriveTimerRoster)
-- and results (deriveRoundResults) key it on left_at, not status. The client drops
-- its now-redundant mark_self_out call.
--
-- Reinstate-after-rejoin still works (D039): a rejoined leaver is status 'out' with
-- rejoined_at > out_at, which deriveTimerRoster already treats as reinstatable.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public, pg_temp;
-- in-function auth.uid(); standard envelope. Additive create-or-replace.

create or replace function public.mark_self_left(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_round_number  int;
  v_player_id     uuid;
  v_player_status player_status;
  v_player_role   player_permission_role;
  v_left_at       timestamptz;
  v_now           timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  -- Lock the session to serialize against finalize / end_party; capture the round
  -- number for the out-fields (convention 1: foreign/nonexistent → NOT_IN_PARTY).
  select current_round_number into v_round_number
  from party_sessions
  where id = p_party_session_id
  for update;
  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, status, permission_role
    into v_player_id, v_player_status, v_player_role
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_player_id is null or v_player_status = 'removed' then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  -- A host leaves by ending the party, not via this action.
  if v_player_role = 'host' then
    return public._rpc_error('HOST_CANNOT_LEAVE',
      'The host cannot leave the party — end it instead.');
  end if;

  -- Stamp the leave marker; coalesce keeps the first leave time on repeat calls.
  -- A still-active mid-game player also goes OUT now, so the game stops counting
  -- them (out_round_number CHECK requires >= 1, satisfied mid-game). An already-out
  -- player keeps their original out_* fields — only left_at is (re)stamped.
  update party_players
  set left_at          = coalesce(left_at, v_now),
      status           = case when v_player_status = 'active' and v_round_number >= 1
                              then 'out'::player_status else status end,
      out_reason       = case when v_player_status = 'active' and v_round_number >= 1
                              then 'self_opted_out'::out_reason else out_reason end,
      out_round_number = case when v_player_status = 'active' and v_round_number >= 1
                              then v_round_number else out_round_number end,
      out_at           = case when v_player_status = 'active' and v_round_number >= 1
                              then v_now else out_at end
  where id = v_player_id
  returning left_at into v_left_at;

  -- A player leaving can be the last unanswered active player — end the window now
  -- rather than waiting out the timer. No-op outside an active shot_window, and when
  -- 0 active remain (the timer / host settle that). Runs under the lock held above.
  perform public.finalize_if_all_submitted(p_party_session_id);

  return public._rpc_success(jsonb_build_object(
    'party_player_id', v_player_id,
    'left_at',         v_left_at
  ));
end;
$$;

comment on function public.mark_self_left(uuid) is
  'Player leaves the game: stamps left_at AND marks a mid-game active caller out '
  '(self_opted_out), then runs finalize_if_all_submitted so the last leaver completes '
  'the round. Excludes the leaver from all status=active game logic; the "Left" label '
  'is keyed on left_at (roster/results), not status. Phase 10 / device-bug fix.';
