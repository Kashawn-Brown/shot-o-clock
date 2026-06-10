// Pure due-check for the phase-advance poll. Kept import-free (no supabase) so it
// unit-tests without env/native deps — same pattern as lobbyView / reconnectRoute.
// See useAdvancePhase for the poll loop that consumes it.

/**
 * Is this phase ready to advance at `nowMs`? A paused/ended session
 * (isActive=false) or a phase with no timer (null phaseEndsAt) is never due.
 */
export function isPhaseDue(phaseEndsAt: string | null, isActive: boolean, nowMs: number): boolean {
  if (!isActive || !phaseEndsAt) return false;
  const endsMs = Date.parse(phaseEndsAt);
  if (Number.isNaN(endsMs)) return false;
  return nowMs >= endsMs;
}
