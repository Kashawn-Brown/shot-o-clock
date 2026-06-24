// Checks whether the guest is in an in-progress party, so the home screen can route
// them straight back into it (reconnect). 'checking' while the first lookup runs;
// 'resolved' once it settles (activeParty is null when there is none).
//
// Runs on every focus of the home screen, not just launch (useFocusEffect). Home is
// the stack root and stays mounted underneath the party screens, so a mount-only
// check never re-ran when something popped back to Home mid-session — leaving a host
// stranded on a stale Home with their party still live. Re-checking on focus makes
// Home self-heal: it bounces straight back into any still-active party (Phase 16 bug
// fix). status is only ever set to 'resolved' (never back to 'checking') after the
// first run, so a normal refocus with no party shows the home actions without a
// spinner flash; the redirect only happens when a live party is actually found.
//
// One exception: a player who tapped Leave Party mid-game is still a member (they
// were marked Out, not removed), so getActiveParty would keep returning their
// party and pull them back in. If the found party matches the intentionally-left
// marker (leftParty), we suppress the reconnect and report no active party. The
// marker is cleared once they are no longer in that party (different party, or
// none), so it can't strand a later, unrelated session.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { syncServerTime } from '@/features/game/syncServerTime';
import { getActiveParty, type ActiveParty } from '@/features/party/api/activeParty';
import { clearLeftPartyId, getLeftPartyId } from '@/features/party/leftParty';

type ReconnectStatus = 'checking' | 'resolved';

interface UseActivePartyResult {
  status: ReconnectStatus;
  activeParty: ActiveParty | null;
}

export function useActiveParty(): UseActivePartyResult {
  const [status, setStatus] = useState<ReconnectStatus>('checking');
  const [activeParty, setActiveParty] = useState<ActiveParty | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        // Align the server-time offset before the home screen decides the reconnect
        // route — the recap-on-reentry age compares phase_started_at (a server stamp)
        // against serverNow(), which is meaningless until this sync runs (Bug fix:
        // device-clock skew made the 30s recap threshold unreliable). Parallel with the
        // party lookup so it adds no latency; never throws.
        const [party] = await Promise.all([getActiveParty(), syncServerTime()]);
        const leftId = await getLeftPartyId();
        if (!active) return;

        // Intentionally left this party — stay home, keep the marker (still a member).
        if (party && leftId === party.partyId) {
          setActiveParty(null);
          setStatus('resolved');
          return;
        }

        // No longer in the left party (moved on, or it ended) — drop the stale marker.
        if (leftId !== null) await clearLeftPartyId();
        if (!active) return;

        setActiveParty(party);
        setStatus('resolved');
      })().catch((error) => {
        // Fail open: on a lookup error, fall through to home rather than trap the user.
        console.error('Failed to check for an active party', error);
        if (active) setStatus('resolved');
      });

      return () => {
        active = false;
      };
    }, []),
  );

  return { status, activeParty };
}
