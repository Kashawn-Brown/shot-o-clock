-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Heads-up push copy tweak
-- ─────────────────────────────────────────────────────────────────────────────
-- Copy-only revision of the Heads-up push title ("Shot O'Clock soon" → with a ⏳).
-- Its own migration because send_heads_up_push is a separate function from a
-- different prior migration (20260624160000) than the #009-remaining batch.
-- Reproduced verbatim from 20260624160000; only the title string changes.
-- ─────────────────────────────────────────────────────────────────────────────

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
    'Shot O''Clock soon ⏳',
    format('Get ready, the next shot is in %s %s.',
           v_minutes, case when v_minutes = 1 then 'minute' else 'minutes' end),
    jsonb_build_object('type', 'shot_window_prewarn', 'partySessionId', p_party_session_id,
                       'roundNumber', v_round_number, 'leadMinutes', v_minutes)
  );
end;
$$;

revoke execute on function public.send_heads_up_push(uuid, int) from public, anon, authenticated;
