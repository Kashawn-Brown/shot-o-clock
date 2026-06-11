// Shot O'Clock — the full-screen "take your shot now" moment. This is the ONLY
// dark-background surface in the app.
//
// Because the background is black, the shared Button (built for light screens)
// doesn't fit — the actions are inverted (white Done, red I'm Out), so they're
// drawn inline here.
//
// The ring shows the REAL shot-window countdown, computed from the session's
// phase_ends_at minus skew-corrected server time (useCountdown) and draining
// clockwise — no client owns the timer (CLAUDE.md §2.1). useTimerSession loads the
// snapshot, aligns the clock, and polls advance_phase_if_due so the window closes
// on the server's schedule; at zero current_phase changes and the route effect
// carries every device onward together.
//
// Phase 8 task 2: Done → mark_done, I'm Out → mark_self_out, with optimistic
// feedback. Done is disabled for non-active players and once you've opted out
// (SELF_OUT_IS_STICKY) — the server backstops both, so a force-close/reconnect
// that loses the optimistic state still can't tap Done after a self-out, because
// myOutcome reloads from the server.
//
// The back arrow is the shared testing escape hatch (useGameExit). The real
// in-game host controls land in Phase 10.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { markDone } from '@/features/party/api/markDone';
import { markSelfOut } from '@/features/party/api/markSelfOut';
import { useCountdown } from '@/features/game/useCountdown';
import { useGameExit } from '@/features/party/useGameExit';
import { useTimerSession } from '@/features/party/useTimerSession';
import { rpcErrorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type PendingAction = 'done' | 'self_out' | null;

export default function ShotOClockScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { status, session, settings, currentRound, me, myOutcome, errorMessage, refreshOutcome } =
    useTimerSession(partyId);
  const { remainingMs } = useCountdown(session?.phase_ends_at ?? null);
  const { leaving, confirmExit } = useGameExit(partyId);

  // Optimistic action: set on tap for instant feedback, reconciled when myOutcome
  // re-reads. Cleared when the round changes (defensive — the screen usually
  // unmounts as the phase leaves shot_window).
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const roundId = currentRound?.id;
  useEffect(() => {
    setPendingAction(null);
    setActionError(null);
  }, [roundId]);

  const isActive = me?.status === 'active';
  const isOut = me?.status === 'out';
  // Only 'done' / 'self_out' are player taps; 'none' / 'missed' aren't acted states.
  const recordedAction =
    myOutcome?.player_action === 'done' || myOutcome?.player_action === 'self_out'
      ? myOutcome.player_action
      : null;
  const myAction = pendingAction ?? recordedAction;
  const doneRecorded = myAction === 'done';
  const selfOutRecorded = myAction === 'self_out';

  // With grace still in hand, opting out reads as a skip (it will consume grace,
  // not eliminate — see D034). With grace spent or off, it's the usual I'm Out.
  const hasGraceRemaining = settings?.grace_mode === 'enabled' && me?.used_grace === false;
  const selfOutLabel = selfOutRecorded
    ? hasGraceRemaining
      ? 'Skipped'
      : "You're out"
    : hasGraceRemaining
      ? 'Skip this shot'
      : "I'm Out";

  const canDone = isActive && !doneRecorded && !selfOutRecorded && !acting;
  // Once Done is recorded, I'm Out is closed for the round (product call — a
  // confirmed shot can't be walked back from the UI, even though the server would
  // allow self_out to override it).
  const canSelfOut = isActive && !doneRecorded && !selfOutRecorded && !acting;

  const handleDone = useCallback(async () => {
    if (!partyId || !canDone) return;
    setActionError(null);
    setActing(true);
    setPendingAction('done');

    const result = await markDone({ partySessionId: partyId });
    setActing(false);

    if (result.ok) {
      refreshOutcome();
      return;
    }
    // Revert the optimistic state and re-sync the truth (e.g. SELF_OUT_IS_STICKY
    // means the server already has a self_out — myOutcome reload reflects it).
    setPendingAction(null);
    setActionError(rpcErrorMessage(result.error_code));
    refreshOutcome();
  }, [partyId, canDone, refreshOutcome]);

  const handleSelfOut = useCallback(async () => {
    if (!partyId || !canSelfOut) return;
    setActionError(null);
    setActing(true);
    setPendingAction('self_out');

    const result = await markSelfOut({ partySessionId: partyId });
    setActing(false);

    if (result.ok) {
      refreshOutcome();
      return;
    }
    setPendingAction(null);
    setActionError(rpcErrorMessage(result.error_code));
    refreshOutcome();
  }, [partyId, canSelfOut, refreshOutcome]);

  // Confirmation gate — opting out is irreversible (only the host can reinstate,
  // game-rules §7), same pattern as End Party / Remove Player.
  const confirmSelfOut = useCallback(() => {
    if (!canSelfOut) return;
    Alert.alert(
      "I'm Out?",
      "You'll sit out the rest of this round and can't undo it — only the host can bring you back in.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: "I'm Out", style: 'destructive', onPress: handleSelfOut },
      ],
    );
  }, [canSelfOut, handleSelfOut]);

  // Ring fills clockwise as the proportion of the shot window remaining. Total is
  // the configured shot_window_seconds; clamp (in ProgressRing) guards against
  // host_add_time pushing remaining past the original window.
  const shotWindowMs = (settings?.shot_window_seconds ?? 0) * 1000;
  const ringProgress = shotWindowMs > 0 ? remainingMs / shotWindowMs : 0;

  // When the server advances the phase (the poll in useTimerSession closes the
  // shot window → countdown for round N+1, or → round_complete on the zero-active
  // halt), the snapshot's current_phase changes — route to that phase's screen.
  // Staying on 'shot_window' keeps us here. This is the consumer side of the
  // timer's server-authoritative transition (CLAUDE.md §2.1), mirroring timer.tsx.
  //
  // Suppressed while `leaving`: the exit flips the phase / the poll can still catch
  // a transition mid-exit, either of which would re-route us right after
  // useGameExit's router.replace('/'). The intentional exit wins.
  const currentPhase = session?.current_phase;

  // Remember the round that was live during the shot window, so when the window
  // closes we can hand its id to the Round Results screen. By then the snapshot has
  // already auto-advanced to round N+1 (D014) and currentRound points at the new
  // round — the ref still holds the round that just finished.
  const completedRoundRef = useRef<{ id: string; number: number } | null>(null);
  useEffect(() => {
    if (currentPhase === 'shot_window' && currentRound?.id) {
      completedRoundRef.current = { id: currentRound.id, number: currentRound.round_number };
    }
  }, [currentPhase, currentRound?.id, currentRound?.round_number]);

  useEffect(() => {
    if (leaving || status !== 'ready' || !partyId || !currentPhase || currentPhase === 'shot_window') {
      return;
    }
    // The party ended during the window → summary. Otherwise the round just
    // finished — auto-advanced to countdown, or rested in the round_complete halt —
    // so show its results, handing over the round that was live in the window.
    if (currentPhase === 'ended') {
      router.replace({ pathname: '/party/[partyId]/summary', params: { partyId } });
      return;
    }
    const completed = completedRoundRef.current;
    router.replace({
      pathname: '/party/[partyId]/results',
      params: completed
        ? { partyId, roundId: completed.id, roundNumber: String(completed.number) }
        : { partyId },
    });
  }, [leaving, status, currentPhase, partyId]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.shotText} />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <ErrorBanner message={errorMessage} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.headerBar}>
        <Pressable onPress={confirmExit} accessibilityRole="button" hitSlop={8} disabled={leaving}>
          <Text style={styles.back}>←</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text style={styles.title}>SHOT{'\n'}O&apos;CLOCK</Text>

        <View style={styles.ringGroup}>
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={8}
            progress={ringProgress}
            color={COLORS.shotRing}
            trackColor="rgba(255,255,255,0.2)"
          >
            <View style={styles.ringContent}>
              <Text style={styles.ringLabel}>SHOT WINDOW</Text>
              <Text style={styles.ringTime}>{formatDuration(remainingMs)}</Text>
            </View>
          </ProgressRing>
          <Text style={styles.ringCaption}>Time to take your shot</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {isActive ? (
          <>
            <ErrorBanner message={actionError} />
            <View style={styles.actionRow}>
              <Pressable
                onPress={confirmSelfOut}
                disabled={!canSelfOut}
                style={[styles.action, styles.outAction, !canSelfOut && !selfOutRecorded && styles.actionDisabled]}
              >
                <Text style={styles.outLabel}>{selfOutLabel}</Text>
              </Pressable>

              <Pressable
                onPress={handleDone}
                disabled={!canDone}
                style={[styles.action, styles.doneAction, !canDone && !doneRecorded && styles.actionDisabled]}
              >
                <Text style={styles.doneLabel}>{doneRecorded ? "You're done ✓" : 'Done ✓'}</Text>
              </Pressable>
            </View>
          </>
        ) : isOut ? (
          <Text style={styles.spectatorNote}>You&apos;re out</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const RING_SIZE = 200;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.shotBackground,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  back: {
    fontSize: FONT_SIZE.md,
    color: COLORS.shotText,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
    textAlign: 'center',
    letterSpacing: 2,
  },
  ringGroup: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  ringContent: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  ringCaption: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.shotText,
    opacity: 0.7,
  },
  ringLabel: {
    fontSize: FONT_SIZE.xs,
    letterSpacing: 1,
    color: COLORS.shotText,
  },
  ringTime: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
  },
  actions: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  spectatorNote: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.shotText,
    textAlign: 'center',
    paddingVertical: SPACING.md,
    opacity: 0.8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  action: {
    flex: 1,
    minHeight: 128,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  doneAction: {
    backgroundColor: COLORS.shotText,
  },
  doneLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotBackground,
  },
  outAction: {
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  outLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.danger,
  },
});
