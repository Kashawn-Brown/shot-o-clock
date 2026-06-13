// Pure derivation for the single-phone (host_only) end screen (D040, D050).
//
// Unlike the multi-device Final Summary (partySummary.ts), a host-only party has
// no tracked players to rank — the end screen shows only how many rounds were
// played and how long the party ran. Kept pure (no React, no clock reads — the
// timestamps are passed in) so the math is unit-tested directly. See summary.tsx
// for the rendering branch.

export type HostOnlyEndView = {
  // Rounds played — end_party preserves current_round_number as history (D045).
  rounds: number;
  // Human-readable wall-clock duration the party ran, or null when either
  // timestamp is missing (e.g. a party that ended before start_game stamped
  // started_at — shouldn't happen in practice, but the screen renders a dash).
  elapsedLabel: string | null;
};

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

// Format a millisecond span as the two most significant units: "1h 18m",
// "18m 42s", or "42s". Negative / zero clamps to "0s". Friendlier than the
// timer's bare M:SS for spans that can run over an hour.
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const hours = Math.floor(totalSeconds / (MINUTES_PER_HOUR * SECONDS_PER_MINUTE));
  const minutes = Math.floor((totalSeconds % (MINUTES_PER_HOUR * SECONDS_PER_MINUTE)) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function deriveHostOnlySummary(input: {
  currentRoundNumber: number;
  startedAt: string | null;
  endedAt: string | null;
}): HostOnlyEndView {
  const { currentRoundNumber, startedAt, endedAt } = input;

  let elapsedLabel: string | null = null;
  if (startedAt && endedAt) {
    const spanMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    // Guard against unparseable timestamps (getTime → NaN) before formatting.
    if (!Number.isNaN(spanMs)) elapsedLabel = formatElapsed(spanMs);
  }

  return {
    rounds: Math.max(0, currentRoundNumber),
    elapsedLabel,
  };
}
