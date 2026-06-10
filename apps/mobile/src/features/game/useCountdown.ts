// Server-authoritative countdown for the timer / shot-window displays.
//
// The hook does NOT own the timer (CLAUDE.md §2.1): it only renders
// `phaseEndsAt − serverNow()`, where serverNow() is skew-corrected (see
// syncServerTime). The interval below is a *display* tick — it re-reads the
// server-derived remaining time a few times a second so the M:SS digits keep up
// with the real boundary. It never advances a phase; the authoritative
// transition is the server's, driven by advance_phase_if_due.

import { useEffect, useState } from 'react';

import { serverNow } from '@/lib/time';

export interface Countdown {
  /** Milliseconds until phaseEndsAt, clamped at 0. 0 when there is no countdown. */
  remainingMs: number;
  /** True once an active countdown has reached zero (phaseEndsAt is in the past). */
  isExpired: boolean;
}

// How often to re-read remaining time for display. 250ms keeps the seconds digit
// from visibly lagging the real boundary without busy-looping.
const DISPLAY_TICK_MS = 250;

/**
 * Pure countdown state for a given `phaseEndsAt` and "now" — extracted from the
 * hook so it unit-tests without a clock or React. A null/invalid timestamp means
 * "no active countdown": zero remaining, not expired.
 */
export function countdownFrom(phaseEndsAt: string | null, nowMs: number): Countdown {
  if (!phaseEndsAt) return { remainingMs: 0, isExpired: false };

  const endsMs = Date.parse(phaseEndsAt);
  if (Number.isNaN(endsMs)) return { remainingMs: 0, isExpired: false };

  const remainingMs = endsMs - nowMs;
  if (remainingMs <= 0) return { remainingMs: 0, isExpired: true };
  return { remainingMs, isExpired: false };
}

/**
 * Live countdown to `phaseEndsAt` (an ISO timestamp from the session, or null in
 * a phase with no timer). Re-renders on a display tick until the countdown
 * expires, then stops — the next phase arrives as a new `phaseEndsAt`.
 */
export function useCountdown(phaseEndsAt: string | null): Countdown {
  const [countdown, setCountdown] = useState<Countdown>(() =>
    countdownFrom(phaseEndsAt, serverNow().getTime()),
  );

  useEffect(() => {
    // Re-read immediately so a phaseEndsAt change reflects without waiting a tick.
    setCountdown(countdownFrom(phaseEndsAt, serverNow().getTime()));

    if (!phaseEndsAt) return;

    const id = setInterval(() => {
      const next = countdownFrom(phaseEndsAt, serverNow().getTime());
      setCountdown(next);
      // Once at zero there is nothing more to display-tick; stop until the phase
      // (and thus phaseEndsAt) changes and re-runs this effect.
      if (next.isExpired) clearInterval(id);
    }, DISPLAY_TICK_MS);

    return () => clearInterval(id);
  }, [phaseEndsAt]);

  return countdown;
}
