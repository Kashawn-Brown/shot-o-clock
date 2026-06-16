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
// There is no exit from this screen: the shot window is brief, so neither the
// host nor a player leaves from here — the host ends the party and a player leaves
// from the timer screen. useGameExit is still mounted only for its `leaving` guard
// on the phase-routing effects (so an in-flight exit elsewhere doesn't re-route).

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { markDone } from '@/features/party/api/markDone';
import { markSelfOut } from '@/features/party/api/markSelfOut';
import { selfOutCopy } from '@/features/game/selfOutCopy';
import { useCountdown } from '@/features/game/useCountdown';
import { useGameExit } from '@/features/party/useGameExit';
import { useTimerSession } from '@/features/party/useTimerSession';
import { rpcErrorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type PendingAction = 'done' | 'self_out' | null;

export default function ShotOClockScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const {
    status,
    session,
    settings,
    currentRound,
    me,
    myOutcome,
    errorMessage,
    partyEnded,
    refreshOutcome,
  } = useTimerSession(partyId);
  const { remainingMs } = useCountdown(session?.phase_ends_at ?? null);
  const { leaving } = useGameExit(partyId);

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

  // Strong haptic burst the instant the shot window opens — the screen only mounts
  // once the phase is already 'shot_window', so this fires on entry. Keyed by round
  // id and guarded by a ref so it bursts exactly once per window (not on re-renders),
  // and re-arms for the next round's window. The burst is three dense runs of Heavy
  // impacts with a pause between them (see HAPTIC_BURSTS — tuned to read as a
  // sustained alarm, not a tap), awaited in sequence so the spacing holds. Fire-and-
  // forget; impactAsync is a no-op without a haptic engine, the catch swallows any
  // platform error, and the cleanup flag stops a partial burst if the window closes
  // mid-sequence.
  const hapticRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'ready' || session?.current_phase !== 'shot_window' || !roundId) return;
    if (hapticRoundRef.current === roundId) return;
    hapticRoundRef.current = roundId;

    let cancelled = false;
    const burst = async (): Promise<void> => {
      for (let b = 0; b < HAPTIC_BURSTS.length; b += 1) {
        const count = HAPTIC_BURSTS[b];
        for (let i = 0; i < count; i += 1) {
          if (cancelled) return;
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          if (i < count - 1) {
            await new Promise((resolve) => setTimeout(resolve, HAPTIC_IMPACT_GAP_MS));
          }
        }
        if (b < HAPTIC_BURSTS.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, HAPTIC_BURST_PAUSE_MS));
        }
      }
    };
    void burst();
    return () => {
      cancelled = true;
    };
  }, [status, session?.current_phase, roundId]);

  const isActive = me?.status === 'active';
  const isOut = me?.status === 'out';
  // Single-phone mode (D040, D050): no Done / I'm Out — the host just watches the
  // shot window — and the round loop skips Round Results, going straight back to
  // the next countdown.
  const hostOnly = settings?.host_only ?? false;
  // Only 'done' / 'self_out' are player taps; 'none' / 'missed' aren't acted states.
  const recordedAction =
    myOutcome?.player_action === 'done' || myOutcome?.player_action === 'self_out'
      ? myOutcome.player_action
      : null;
  const myAction = pendingAction ?? recordedAction;
  const doneRecorded = myAction === 'done';
  const selfOutRecorded = myAction === 'self_out';

  // Button + confirmation copy track what opting out will actually do this round
  // (D034 grace-aware skip): "Skip" when elimination is off, "Skip this shot" with
  // grace in hand, else "I'm Out". See selfOutCopy.
  const {
    label: selfOutLabel,
    requiresConfirm,
    confirmTitle,
    confirmMessage,
    confirmButton,
  } = selfOutCopy({
    eliminationEnabled: settings?.elimination_enabled,
    graceMode: settings?.grace_mode,
    usedGrace: me?.used_grace,
    selfOutRecorded,
  });

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

  // Confirmation gate. A skip with no consequence (elimination off) needs no
  // confirmation — act immediately. Otherwise confirm, since opting out is
  // irreversible within the round (game-rules §7).
  const confirmSelfOut = useCallback(() => {
    if (!canSelfOut) return;
    if (!requiresConfirm) {
      void handleSelfOut();
      return;
    }
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmButton, style: 'destructive', onPress: handleSelfOut },
    ]);
  }, [canSelfOut, handleSelfOut, requiresConfirm, confirmTitle, confirmMessage, confirmButton]);

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
    if (
      leaving ||
      partyEnded ||
      status !== 'ready' ||
      !partyId ||
      !currentPhase ||
      currentPhase === 'shot_window'
    ) {
      return;
    }
    // The party ended (e.g. the screen loaded after end_party, so the snapshot read
    // it directly) → Final Summary (Phase 11). Otherwise the round just finished —
    // auto-advanced to countdown, or rested in the round_complete halt — so show its
    // results, handing over the round that was live in the window.
    if (currentPhase === 'ended') {
      router.replace(`/party/${partyId}/summary`);
      return;
    }
    // Single-phone mode skips Round Results entirely (D040) — the window closed,
    // so go straight back to the next round's countdown on the timer screen.
    if (hostOnly) {
      router.replace({ pathname: '/party/[partyId]/timer', params: { partyId } });
      return;
    }
    const completed = completedRoundRef.current;
    router.replace({
      pathname: '/party/[partyId]/results',
      params: completed
        ? { partyId, roundId: completed.id, roundNumber: String(completed.number) }
        : { partyId },
    });
  }, [leaving, partyEnded, status, currentPhase, partyId, hostOnly]);

  // Host ended the party — read live off the party_sessions realtime payload
  // (useTimerSession.partyEnded), so we route on even if a get_party_state refresh
  // would have failed. End Party lands every device on the Final Summary (Phase 11).
  useEffect(() => {
    if (partyEnded && partyId) router.replace(`/party/${partyId}/summary`);
  }, [partyEnded, partyId]);

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

      {/* No exit from the Shot O'Clock screen (host or player) — the shot window is
          brief; leaving happens from the timer screen. The empty header preserves
          the ring's vertical position. */}
      <View style={styles.headerBar} />

      <View style={styles.center}>
        {/* Single-phone mode has no Done / I'm Out buttons, so the moment leans on
            the title + ring to fill the space — both scale up (D050). */}
        <Text style={[styles.title, hostOnly && styles.titleLarge]}>
          SHOT{'\n'}O&apos;CLOCK
        </Text>

        <View style={styles.ringGroup}>
          <ProgressRing
            size={hostOnly ? HOST_ONLY_RING_SIZE : RING_SIZE}
            strokeWidth={hostOnly ? 10 : 8}
            progress={ringProgress}
            color={COLORS.shotRing}
            trackColor="rgba(255,255,255,0.2)"
          >
            <View style={styles.ringContent}>
              <Text style={[styles.ringLabel, hostOnly && styles.ringLabelLarge]}>SHOT WINDOW</Text>
              <Text style={[styles.ringTime, hostOnly && styles.ringTimeLarge]}>
                {formatDuration(remainingMs)}
              </Text>
            </View>
          </ProgressRing>
          <Text style={[styles.ringCaption, hostOnly && styles.ringCaptionLarge]}>
            {hostOnly ? 'Time to take your shots' : 'Time to take your shot'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {hostOnly ? null : isActive ? (
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

// Shot-window-open haptic burst: three bursts of Heavy impacts with a pause between
// them, so it reads as a sustained alarm rather than a single tap (expo-haptics has
// no continuous-buzz API, so a dense run of transients is the closest we can get).
const HAPTIC_BURSTS = [40, 40, 60]; // Heavy impacts per burst
const HAPTIC_IMPACT_GAP_MS = 15; // between impacts within a burst
const HAPTIC_BURST_PAUSE_MS = 150; // between bursts

// Matches the timer ring size for visual consistency across the two screens.
const RING_SIZE = 280;
// Single-phone mode drops the action buttons, so the ring grows to fill the space.
const HOST_ONLY_RING_SIZE = 330;
// How far to nudge the "SHOT O'CLOCK" title up the page (px). Visual-only
// (translateY) so it shifts the title without moving the ring. More negative =
// higher. Consumed by styles.title below.
const TITLE_OFFSET_Y = -25;

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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
    textAlign: 'center',
    letterSpacing: 2,
    
  },
  // Larger title for single-phone mode, where there are no action buttons below.
  titleLarge: {
    fontSize: 56,
    letterSpacing: 4,
    // Nudge up the page without moving the ring (TITLE_OFFSET_Y).
    transform: [{ translateY: TITLE_OFFSET_Y }],
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
  // Single-phone bumps the in-ring + caption text to match the larger ring/title.
  ringCaptionLarge: {
    fontSize: FONT_SIZE.md,
    transform: [{ translateY: 20 }],
  },
  ringLabel: {
    fontSize: FONT_SIZE.xs,
    letterSpacing: 1,
    color: COLORS.shotText,
  },
  ringLabelLarge: {
    fontSize: FONT_SIZE.sm,
    letterSpacing: 2,
  },
  ringTime: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
  },
  ringTimeLarge: {
    fontSize: 56,
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
