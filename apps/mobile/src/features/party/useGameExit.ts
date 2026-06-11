// useGameExit — the one working "get me out of this game and back home" exit for
// EVERY in-game screen (timer, shot window, results, roster). Mount it on any
// screen reachable during an active party so a player can never get stranded.
//
// Why this exists / the rule it enforces:
//   - Host  → end_party (ends the party for everyone), then route home.
//   - Guest → mark_self_out (best effort, records them out), then route home.
//   - NEVER leave_party here. leave_party is lobby-only (rpc-contracts §4.3); a
//     guest calling it mid-game gets ILLEGAL_TRANSITION and is left stranded with
//     no way home. That bug recurred repeatedly in testing — this hook is the
//     permanent fix, so the lobby-only call lives ONLY in the lobby.
//
// Either way the device routes home, so the exit can't fail closed. mark_self_out
// is only legal in countdown/shot_window (rpc-contracts §7.3): on the results
// screen (round_complete) it no-ops with ILLEGAL_TRANSITION — intentional, we
// still route home. This is the testing escape hatch until Phase 10 (host
// controls) and Phase 11 (End Party propagation + end-of-game routing) replace it
// with the real in-game exits. New game screens in later phases should mount this
// hook to inherit a working exit. See decisions.md D032.

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { endParty } from '@/features/party/api/endParty';
import { markSelfOut } from '@/features/party/api/markSelfOut';

interface ConfirmExitOptions {
  /** The caller's role, when known, so the confirmation copy is role-correct: a
   *  host is ending the game for everyone, a player is only leaving. Omitted on
   *  screens that don't resolve the role — those fall back to neutral copy. */
  isHost?: boolean;
}

interface UseGameExitResult {
  /** True while the exit is in flight — bind to disabled state and suppress phase-routing effects. */
  leaving: boolean;
  /** Show the confirmation dialog; on confirm, exits the party and routes home. */
  confirmExit: (options?: ConfirmExitOptions) => void;
}

// Role-correct confirmation copy. The exit BEHAVIOR is still decided server-side
// (endParty → NOT_HOST falls back to self-out); isHost only shapes the wording.
function exitCopy(isHost: boolean | undefined): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  if (isHost === true) {
    return {
      title: 'End party?',
      message: 'This ends the game for everyone and returns you home.',
      confirmLabel: 'End Party',
    };
  }
  if (isHost === false) {
    return {
      title: 'Leave party?',
      message: 'You will leave the game and return home.',
      confirmLabel: 'Leave Party',
    };
  }
  // Role unknown — neutral wording that fits either path.
  return {
    title: 'Leave party?',
    message: 'If you are the host, this ends the party for everyone.',
    confirmLabel: 'Leave',
  };
}

export function useGameExit(partyId: string | undefined): UseGameExitResult {
  const [leaving, setLeaving] = useState(false);

  const handleExit = useCallback(async () => {
    if (!partyId || leaving) return;
    setLeaving(true);

    // Host path: end the party for everyone.
    const ended = await endParty({ partySessionId: partyId });
    if (ended.ok) {
      router.replace('/');
      return;
    }

    // Not the host (NOT_HOST), or the session is already gone (SESSION_NOT_FOUND).
    // Record a best-effort self-out so the roster reflects the guest leaving, then
    // go home regardless of the result. Intentionally ignores the result: on
    // round_complete mark_self_out returns ILLEGAL_TRANSITION (rpc-contracts §7.3)
    // — not a failure to surface, just not applicable. A guest must never be
    // stranded mid-game, so we route home either way.
    await markSelfOut({ partySessionId: partyId });
    router.replace('/');
  }, [partyId, leaving]);

  const confirmExit = useCallback(
    (options?: ConfirmExitOptions) => {
      if (leaving) return;
      const { title, message, confirmLabel } = exitCopy(options?.isHost);
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmLabel, style: 'destructive', onPress: handleExit },
      ]);
    },
    [leaving, handleExit],
  );

  return { leaving, confirmExit };
}
