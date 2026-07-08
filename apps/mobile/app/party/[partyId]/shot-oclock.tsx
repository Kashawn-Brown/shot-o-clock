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

import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { shotSoundAsset } from '@/features/notifications/api/shotSounds';
import { useEffectiveAlertPrefs } from '@/features/notifications/useEffectiveAlertPrefs';
import { hostEndShotWindow } from '@/features/party/api/hostEndShotWindow';
import { markDone } from '@/features/party/api/markDone';
import { markSelfOut } from '@/features/party/api/markSelfOut';
import { selfOutCopy } from '@/features/game/selfOutCopy';
import { useCountdown } from '@/features/game/useCountdown';
import { useGameExit } from '@/features/party/useGameExit';
import { useBlockBack } from '@/features/party/useBlockBack';
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
    refreshSession,
  } = useTimerSession(partyId);
  const { remainingMs } = useCountdown(session?.phase_ends_at ?? null);

  // Phase-gate the displayed countdown. session.phase_ends_at is one field reused
  // across phases, so the instant the round finalizes it rolls to the NEXT round's
  // deadline — but navigation off this screen is a post-paint effect (below), so for
  // a frame this screen is still mounted while remainingMs already reflects the next
  // countdown. Hold the last in-window value until we navigate, so the ring/number
  // never flash the next round's time under the Shot O'Clock UI.
  const inShotWindow = session?.current_phase === 'shot_window';
  const lastInWindowMsRef = useRef(remainingMs);
  if (inShotWindow) lastInWindowMsRef.current = remainingMs;
  const displayMs = inShotWindow ? remainingMs : lastInWindowMsRef.current;

  // Foreground ALERT prefs for this party (sound on/off, haptic on/off, which sound) —
  // global layered with the per-session override (D064). `loaded` lets the window-open
  // effect wait for the real values rather than firing on the defaults.
  const alertPrefs = useEffectiveAlertPrefs(partyId);

  // Shot-window alert sound — the chosen sound file (D064; one option today, the CC0
  // placeholder — see assets/sounds/CREDITS.md). Plays once when the window opens IF
  // Alert sound is on. Foreground only and respects the device silent switch (no
  // playsInSilentMode set). The player is recreated per mount / on a sound change.
  const shotSound = useAudioPlayer(shotSoundAsset(alertPrefs.soundChoice));
  const { leaving } = useGameExit(partyId);

  // The Shot O'Clock moment is brief and intentionally offers no exit (D044) — so OS
  // back is fully inert here, not even a confirmation. Players leave from the timer.
  useBlockBack();

  // Optimistic action: set on tap for instant feedback, reconciled when myOutcome
  // re-reads. Cleared when the round changes (defensive — the screen usually
  // unmounts as the phase leaves shot_window).
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Host-only: end the shot window early and roll to the next round. With no other
  // players to wait on, the multi-device auto-close (D051) never fires, so the lone
  // host would otherwise have to wait out the full window every round. Reuses the
  // existing host_end_shot_window finalize + auto-advance, host-triggered.
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

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
    // Wait for the real alert prefs so we fire with the right sound/haptic gates rather
    // than the loading defaults; the ref-guard then ensures exactly once per window.
    if (!alertPrefs.loaded) return;
    if (hapticRoundRef.current === roundId) return;
    hapticRoundRef.current = roundId;

    // Alert sound — only when enabled (default OFF, D064). Fresh player per window, so
    // play() starts from the top. Fire-and-forget; a no-op if the asset isn't ready or
    // the device is on silent.
    if (alertPrefs.soundEnabled) shotSound.play();

    // Alert haptic — only when enabled (default ON, D064). A brief 3-pulse ramp
    // (medium → heavy → heavy) that reads as a punchy alert, not a sustained alarm —
    // this is the FOREGROUND in-app haptic, retuned for that role now that D064 split
    // it from the backgrounded notification (which the OS owns).
    if (!alertPrefs.hapticEnabled) return;
    let cancelled = false;
    const burst = async (): Promise<void> => {
      for (let i = 0; i < ALERT_HAPTIC_PULSES.length; i += 1) {
        if (cancelled) return;
        await Haptics.impactAsync(IMPACT_STYLE[ALERT_HAPTIC_PULSES[i]]).catch(() => {});
        if (i < ALERT_HAPTIC_PULSES.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, ALERT_HAPTIC_GAP_MS));
        }
      }
    };
    void burst();
    return () => {
      cancelled = true;
    };
  }, [
    status,
    session?.current_phase,
    roundId,
    shotSound,
    alertPrefs.loaded,
    alertPrefs.soundEnabled,
    alertPrefs.hapticEnabled,
  ]);

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

  const handleHostSkip = useCallback(async () => {
    if (!partyId || skipping) return;
    setSkipError(null);
    setSkipping(true);
    const result = await hostEndShotWindow({ partySessionId: partyId });
    setSkipping(false);
    if (result.ok) {
      // Advance promptly rather than waiting on the realtime round-trip; the phase-
      // routing effect then carries the host to the next round's timer.
      refreshSession();
      return;
    }
    setSkipError(rpcErrorMessage(result.error_code));
  }, [partyId, skipping, refreshSession]);

  // Ring fills clockwise as the proportion of the shot window remaining. Total is
  // the configured shot_window_seconds; clamp (in ProgressRing) guards against
  // host_add_time pushing remaining past the original window.
  const shotWindowMs = (settings?.shot_window_seconds ?? 0) * 1000;
  const ringProgress = shotWindowMs > 0 ? displayMs / shotWindowMs : 0;

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
              <Text style={[styles.ringTime, hostOnly && styles.ringTimeLarge]}>
                {formatDuration(displayMs)}
              </Text>
            </View>
          </ProgressRing>
          <Text style={[styles.ringCaption, hostOnly && styles.ringCaptionLarge]}>
            {hostOnly ? 'Time to take your shots' : 'Time to take your shot'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {hostOnly ? (
          <>
            <ErrorBanner message={skipError} />
            <Pressable
              onPress={handleHostSkip}
              disabled={skipping}
              accessibilityRole="button"
              style={[styles.hostSkipButton, skipping && styles.actionDisabled]}
            >
              <Text style={styles.hostSkipLabel}>Skip to Next Round</Text>
            </Pressable>
          </>
        ) : isActive ? (
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

// Shot-window-open ALERT haptic (foreground, D064): a brief 3-pulse ramp that reads as
// a punchy alert rather than a sustained alarm. Each entry is one impactAsync at the
// given style, ALERT_HAPTIC_GAP_MS apart (~0.18s total).
const ALERT_HAPTIC_PULSES = ['medium', 'heavy', 'heavy'] as const;
const ALERT_HAPTIC_GAP_MS = 90; // between pulses
const IMPACT_STYLE = {
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

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
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
    textAlign: 'center',
    letterSpacing: 2,
    transform: [{ translateY: TITLE_OFFSET_Y }],
  },
  // Larger title for single-phone mode, where there are no action buttons below.
  titleLarge: {
    fontSize: FONT_SIZE.xxl,
    letterSpacing: 2,
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
    fontSize: FONT_SIZE.custom_3,
    color: COLORS.shotText,
    opacity: 0.7,
  },
  // Single-phone bumps the in-ring + caption text to match the larger ring/title.
  ringCaptionLarge: {
    fontSize: FONT_SIZE.md,
    transform: [{ translateY: 20 }],
  },
  ringTime: {
    fontSize: FONT_SIZE.xxl,
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
    minHeight: 108,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.black,
  },
  actionDisabled: {
    opacity: 0.4,
  },
  doneAction: {
    backgroundColor: COLORS.shotText,
  },
  doneLabel: {
    fontSize: FONT_SIZE.custom_4,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotBackground,
  },
  outAction: {
    borderWidth: 2,
    borderColor: COLORS.danger,
    backgroundColor: COLORS.shotText,
  },
  outLabel: {
    fontSize: FONT_SIZE.custom_4,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.danger,
  },
  // Host-only "Skip to Next Round": a white-outline button on the dark screen
  // (the shared Button is built for light screens, so it's drawn inline here).
  hostSkipButton: {
    borderWidth: 2,
    borderColor: COLORS.shotText,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostSkipLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
  },
});
