-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 14 (extension) — Server-driven phase advancement via pg_cron
-- ─────────────────────────────────────────────────────────────────────────────
-- Until now both due transitions (countdown→shot_window, shot_window→finalize)
-- were driven ONLY by client polling of advance_phase_if_due (rpc-contracts.md
-- §8.7 trigger 2). With no client connected, an expired phase never advances —
-- a backgrounded/abandoned game freezes mid-round. This adds the §8.7 trigger (1)
-- the spec always reserved ("edge function on a schedule"): a pg_cron job that
-- sweeps due sessions every 5 seconds and runs the SAME transition.
--
-- The finalize/grace/status logic is unchanged — this only gives the existing
-- helpers a caller that needs no auth.uid(). The transition body is lifted out of
-- advance_phase_if_due into a shared internal helper (_advance_due_session) so the
-- client RPC and the cron sweep are one source of truth (no duplicated SQL). The
-- client poll and all host controls are untouched — the sweep is a fallback caller,
-- not a replacement (CLAUDE.md §2.1: the server still owns the timer).
--
-- Locked conventions (#D010): internal helpers are SECURITY DEFINER,
-- SET search_path = public, pg_temp, EXECUTE revoked from API roles.
-- See rpc-contracts.md §8.4 / §8.7 / §8.8.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. pg_cron extension ─────────────────────────────────────────────────────
-- Preloaded via shared_preload_libraries; cron.database_name = 'postgres' matches
-- the app DB, so jobs created here run against our data. Idempotent.
create extension if not exists pg_cron;


-- ─── 2. Sweep index ───────────────────────────────────────────────────────────
-- Keeps the 5s candidate query O(due) rather than O(all sessions): a partial index
-- over only the two due-able phases of active sessions, keyed by phase_ends_at.
create index if not exists idx_party_sessions_due_phase
  on party_sessions (phase_ends_at)
  where status = 'active' and current_phase in ('countdown', 'shot_window');


-- ─── 3. _advance_due_session (internal) ──────────────────────────────────────
-- The per-session transition core, lifted verbatim from advance_phase_if_due's
-- body (20260613130000) minus the auth/member checks. Locks the session, re-checks
-- the §8.3 due conditions under the lock, then performs the countdown→shot_window
-- open (+ window-open all-answered check) or the shot_window→finalize advance.
-- Returns a discriminated result so the client RPC can preserve its NO_ACTIVE_PLAYERS
-- contract while the cron sweep simply ignores that case.
--   { "outcome": 'transitioned' | 'not_due' | 'no_active_players',
--     "new_phase": party_phase | null }
create or replace function public._advance_due_session(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session           party_sessions%rowtype;
  v_round_id          uuid;
  v_round_shot_window int;
  v_active_count      int;
  v_new_phase         party_phase;
  v_shot_ends_at      timestamptz;
  v_now               timestamptz := now();
begin
  select * into v_session
  from party_sessions
  where id = p_party_session_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_due', 'new_phase', null);
  end if;

  -- §8.3 due gate (same as advance_phase_if_due): active, a due-able phase, a real
  -- deadline, and now past it. Anything else is a no-op, not an error.
  if v_session.status != 'active'
     or v_session.current_phase not in ('countdown', 'shot_window')
     or v_session.phase_ends_at is null
     or v_now < v_session.phase_ends_at then
    return jsonb_build_object('outcome', 'not_due', 'new_phase', null);
  end if;

  select id, shot_window_seconds
    into v_round_id, v_round_shot_window
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  if v_session.current_phase = 'countdown' then
    -- §8.4 countdown → shot_window. Cannot open a window with nobody active
    -- (defensive — the zero-active halt rests in round_complete, never countdown).
    select count(*) into v_active_count
    from party_players
    where party_session_id = p_party_session_id
      and status = 'active';

    if v_active_count = 0 then
      return jsonb_build_object('outcome', 'no_active_players', 'new_phase', null);
    end if;

    v_shot_ends_at := v_now + make_interval(secs => v_round_shot_window);

    update rounds
    set status = 'shot_window',
        shot_window_started_at = v_now,
        shot_window_ends_at = v_shot_ends_at
    where id = v_round_id;

    update party_sessions
    set current_phase = 'shot_window',
        phase_started_at = v_now,
        phase_ends_at = v_shot_ends_at
    where id = p_party_session_id;

    insert into timer_events (
      party_session_id, round_id, round_number, event_type,
      previous_phase, new_phase, new_ends_at, triggered_by, triggered_by_player_id
    )
    values (
      p_party_session_id, v_round_id, v_session.current_round_number, 'shot_window_started',
      'countdown', 'shot_window', v_shot_ends_at, 'system', null
    );

    -- Window-open all-answered check (Phase 12): if everyone opted out during the
    -- countdown, close the just-opened window on the spot.
    perform public.finalize_if_all_submitted(p_party_session_id);

    select current_phase into v_new_phase
    from party_sessions
    where id = p_party_session_id;

    return jsonb_build_object('outcome', 'transitioned', 'new_phase', v_new_phase);
  else
    -- §8.4 shot_window → finalize + auto-advance, via the shared helper
    -- (triggered_by = system: the timer fired, not the host).
    perform public.finalize_round_outcomes(p_party_session_id, 'system'::triggered_by, null);

    select current_phase into v_new_phase
    from party_sessions
    where id = p_party_session_id;

    return jsonb_build_object('outcome', 'transitioned', 'new_phase', v_new_phase);
  end if;
end;
$$;

comment on function public._advance_due_session(uuid) is
  'Internal: locks one session and runs the due countdown→shot_window or '
  'shot_window→finalize transition (rpc-contracts.md §8.4). Shared by '
  'advance_phase_if_due (client poll) and cron_advance_due_phases (server sweep). '
  'EXECUTE revoked; callers are the owner-role SECURITY DEFINER functions.';

revoke execute on function public._advance_due_session(uuid) from public;
revoke execute on function public._advance_due_session(uuid) from anon, authenticated;


-- ─── 4. advance_phase_if_due (re-pointed to the shared core) ──────────────────
-- Same external contract as 20260613130000 (§8.5). Keeps the auth + active/out
-- member checks, then delegates the transition to _advance_due_session. The
-- countdown-with-zero-active case still surfaces as NO_ACTIVE_PLAYERS.
create or replace function public.advance_phase_if_due(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_is_member boolean;
  v_core      jsonb;
  v_outcome   text;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  -- Existence + membership (DEFINER bypasses RLS, so replicate the read-RPC rule:
  -- active/out member). Both "no session" and "not a member" collapse into
  -- SESSION_NOT_FOUND (§13 non-distinction).
  if not exists (select 1 from party_sessions where id = p_party_session_id) then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;

  select exists (
    select 1 from party_players
    where party_session_id = p_party_session_id
      and user_id = v_user_id
      and status in ('active', 'out')
  ) into v_is_member;

  if not v_is_member then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;

  v_core    := public._advance_due_session(p_party_session_id);
  v_outcome := v_core ->> 'outcome';

  if v_outcome = 'no_active_players' then
    return public._rpc_error('NO_ACTIVE_PLAYERS',
      'No active players remain; the shot window cannot open.');
  elsif v_outcome = 'not_due' then
    return public._rpc_success(jsonb_build_object('transitioned', false, 'new_phase', null));
  else
    return public._rpc_success(jsonb_build_object(
      'transitioned', true,
      'new_phase',    v_core ->> 'new_phase'
    ));
  end if;
end;
$$;

comment on function public.advance_phase_if_due(uuid) is
  'Timer-authority client RPC: auth + member check, then delegates to '
  '_advance_due_session. Behaviorally unchanged from 20260613130000; the transition '
  'body now lives in the shared core. See rpc-contracts.md §8 and decisions.md D014.';


-- ─── 5. cron_advance_due_phases (server sweep) ───────────────────────────────
-- Called only by the pg_cron job. Sweeps every active session whose due-able phase
-- has expired and advances each via the shared core. skip locked so it never waits
-- on a session a client is mid-transition on (that client will finish it, or the
-- next 5s tick will). Returns the count actually advanced (for cron logs).
create or replace function public.cron_advance_due_phases()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_count int := 0;
  v_core  jsonb;
begin
  for v_id in
    select id
    from party_sessions
    where status = 'active'
      and current_phase in ('countdown', 'shot_window')
      and phase_ends_at is not null
      and phase_ends_at <= now()
    order by phase_ends_at
    for update skip locked
  loop
    v_core := public._advance_due_session(v_id);
    if v_core ->> 'outcome' = 'transitioned' then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.cron_advance_due_phases() is
  'Server-side timer fallback (rpc-contracts.md §8.7 trigger 1): advances every '
  'overdue active countdown/shot_window with no client present. Scheduled by '
  'pg_cron every 5s. EXECUTE revoked from API roles; only pg_cron/owner calls it.';

revoke execute on function public.cron_advance_due_phases() from public;
revoke execute on function public.cron_advance_due_phases() from anon, authenticated;


-- ─── 6. Schedule the sweep (every 5 seconds) ─────────────────────────────────
-- pg_cron >= 1.5 supports sub-minute interval schedules. cron.schedule upserts by
-- job name, so re-running this migration is idempotent.
select cron.schedule(
  'advance-due-phases',
  '5 seconds',
  $cron$select public.cron_advance_due_phases();$cron$
);


-- ─── 7. Prune pg_cron run history (daily, 7-day retention) ───────────────────
-- The 5s sweep writes ~17k cron.job_run_details rows/day and pg_cron does not prune
-- them. A daily job (03:00 UTC) trims completed runs older than 7 days. The null-end
-- guard leaves any in-flight run untouched. Idempotent (upsert by name).
select cron.schedule(
  'prune-cron-run-details',
  '0 3 * * *',
  $cron$delete from cron.job_run_details where end_time < now() - interval '7 days';$cron$
);
