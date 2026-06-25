// Pure client-side mirror of the two host_set_heads_up gates, so Surface B can
// proactively disable the Heads-up control (with a reason) instead of only finding
// out via a rejected RPC. The server stays the real enforcement — this is advisory.
//
// Gate 1 (once per round) is shown first when both apply: it's the persistent state
// and more informative than the transient fire-window. (The server checks Gate 2
// first for error precedence, but since the control is disabled either way, only the
// message differs — see decisions.md D070.)

export interface HeadsUpGateInputs {
  status: string | null; // session.status
  currentPhase: string | null; // session.current_phase
  phaseStartedAt: string | null; // session.phase_started_at (ISO)
  phaseEndsAt: string | null; // session.phase_ends_at (ISO)
  enabled: boolean; // current committed Heads-up on/off
  leadSeconds: number; // current committed lead
  changedThisRound: boolean; // rounds.heads_up_setting_changed_at != null
  sentThisRound: boolean; // rounds.heads_up_push_sent_at != null
}

export type HeadsUpGate = { locked: false } | { locked: true; reason: string };

/**
 * @param nowMs skew-corrected server time (serverNow().getTime()) — Gate 2 is
 *   time-based, so the caller must re-evaluate on a tick, not just once.
 */
export function headsUpGate(input: HeadsUpGateInputs, nowMs: number): HeadsUpGate {
  // Gate 1 — once per round (persistent; shown first).
  if (input.changedThisRound) {
    return { locked: true, reason: 'Already changed this round — try again next round.' };
  }

  // Gate 2 — fire-window lock. Same conditions as the server: currently enabled, an
  // active countdown that hasn't sent yet, and now within [entry, ends) where the
  // lead fits the countdown (entry strictly after the countdown started).
  if (
    input.enabled &&
    input.status === 'active' &&
    input.currentPhase === 'countdown' &&
    input.phaseEndsAt != null &&
    input.phaseStartedAt != null &&
    !input.sentThisRound
  ) {
    const endsMs = Date.parse(input.phaseEndsAt);
    const startedMs = Date.parse(input.phaseStartedAt);
    if (!Number.isNaN(endsMs) && !Number.isNaN(startedMs)) {
      const entryMs = endsMs - input.leadSeconds * 1000;
      if (entryMs > startedMs && nowMs >= entryMs && nowMs < endsMs) {
        return { locked: true, reason: "About to send — try again after this round's shot." };
      }
    }
  }

  return { locked: false };
}
