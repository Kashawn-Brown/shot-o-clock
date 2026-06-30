// Timer — the between-shots countdown. Single file that adapts for host vs
// player. The bottom row carries a destructive exit (End Party for the host,
// Leave Party for a player), a Roster button opening the roster sheet (host gets
// per-player Mark Out / Reinstate / Remove there; a player sees it read-only),
// and the I'm Out / Skip action below.
//
// The ring shows the REAL countdown, computed from the session's phase_ends_at
// minus skew-corrected server time (useCountdown) and draining clockwise — no
// client owns the timer (CLAUDE.md §2.1). useTimerSession loads the snapshot,
// aligns the clock, polls advance_phase_if_due to drive the transition, and
// subscribes to the session + roster rows so host actions reflect on every device.
//
// End/Leave Party go through useGameExit: end_party → Final Summary for the host
// (the intentional wrap-up), mark_self_out → home for a guest (D032). The other
// devices follow the host onto the summary via partyEnded / 'ended' detection.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { RosterSheet } from '@/features/party/RosterSheet';
import { hostAddTime } from '@/features/party/api/hostAddTime';
import { hostPauseTimer } from '@/features/party/api/hostPauseTimer';
import { hostResumeTimer } from '@/features/party/api/hostResumeTimer';
import { markSelfOut } from '@/features/party/api/markSelfOut';
import { selfOutCopy } from '@/features/game/selfOutCopy';
import { useCountdown } from '@/features/game/useCountdown';
import { useGameExit } from '@/features/party/useGameExit';
import { useBlockBack } from '@/features/party/useBlockBack';
import { shareJoinCode } from '@/features/party/shareJoinCode';
import { routeForPhase } from '@/features/party/reconnectRoute';
import { useRecapOnResume } from '@/features/party/useRecapOnResume';
import { useTimerSession } from '@/features/party/useTimerSession';
import { rpcErrorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function TimerScreen(): React.JSX.Element {
  // lastRound* are handed over by the Round Results screen when it sends us here,
  // so we can offer a button back to the round that just finished.
  const { partyId, lastRoundId, lastRoundNumber } = useLocalSearchParams<{
    partyId: string;
    lastRoundId?: string;
    lastRoundNumber?: string;
  }>();
  const {
    status,
    session,
    settings,
    currentRound,
    me,
    myOutcome,
    roundOutcomes,
    errorMessage,
    membershipLost,
    partyEnded,
    players,
    refreshOutcome,
    refreshSession,
  } = useTimerSession(partyId);
  const { remainingMs: liveRemainingMs } = useCountdown(session?.phase_ends_at ?? null);
  const { leaving, confirmExit } = useGameExit(partyId);

  // Warm-resume recap: if a round advanced while this screen was backgrounded, land on
  // the previous round's recap on return (the cold-launch reconnect only runs on a
  // fresh start). Suppressed mid-exit. See useRecapOnResume.
  useRecapOnResume(partyId, session?.current_round_number ?? null, !leaving);

  // The caller's role drives the host-only roster controls (Mark Out / Reinstate /
  // Remove live in the Roster sheet) and the destructive bottom-left button: a
  // host ends the party, a player leaves it. RPCs backstop with NOT_HOST, so the
  // gate is defence in depth (PartyPlayer.permissionRole, §2.4).
  const isHost = me?.permission_role === 'host';
  // Single-phone mode (D040, D050): the host runs the game solo, so the multi-device
  // surfaces collapse — no join-code popover, no Players sheet, no I'm Out, no
  // results link. The host is the only player and never self-outs.
  const hostOnly = settings?.host_only ?? false;

  // OS back routes through the same exit confirmation as the End/Leave button, so a
  // back-press is handled gracefully instead of silently popping out of the live
  // party (D044 / Phase 16 bug fix). Paired with gestureEnabled:false in _layout.
  useBlockBack(() => confirmExit({ isHost, hostOnly }));

  const isPaused = session?.status === 'paused';
  const [rosterOpen, setRosterOpen] = useState(false);
  // Host taps the party name to reveal the join code for sharing mid-game.
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);

  // While paused the server freezes the timer under option (a): status → paused,
  // phase_ends_at left intact (§10.1). So the live countdown would keep draining
  // a stale deadline — show the frozen paused_remaining_seconds instead, on every
  // device (the realtime session sub delivers the paused status). useCountdown
  // stays pure; we just pick which value to display.
  const remainingMs = isPaused ? (session?.paused_remaining_seconds ?? 0) * 1000 : liveRemainingMs;

  // Phase-gate the displayed countdown — same reason as the Shot O'Clock screen.
  // When this round's countdown finalizes, session.phase_ends_at rolls to the shot
  // window's deadline before the routing effect (below) navigates us there, so for a
  // frame remainingMs would show the shot-window time under "NEXT SHOT O'CLOCK IN".
  // Hold the last countdown value until we navigate. (Pausing keeps the phase on
  // 'countdown', so the paused freeze is unaffected.)
  const inCountdown = session?.current_phase === 'countdown';
  const lastCountdownMsRef = useRef(remainingMs);
  if (inCountdown) lastCountdownMsRef.current = remainingMs;
  const displayMs = inCountdown ? remainingMs : lastCountdownMsRef.current;

  // Host timer controls (pause/resume, add time) — integrated onto the ring, not a
  // sheet. One in-flight lock across them; add_time isn't idempotent, so the lock
  // is what stops a double-tap stacking two extensions (hostAddTime.ts). Errors
  // surface in a small banner under the ring. On success refreshSession re-pulls so
  // the host's screen updates without waiting on the realtime round-trip.
  const [controlBusy, setControlBusy] = useState(false);
  // Which control is mid-call, so the dim/press feedback shows on ONLY the tapped
  // one (controlBusy still blocks all three from firing at once).
  const [busyControl, setBusyControl] = useState<'pause' | 'short' | 'long' | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);

  // Control errors (add-time cap, pause/resume failures) surface as a transient
  // overlay toast, not an in-flow banner: the old banner was the last child inside
  // the ScrollView, so on a short viewport / large font scale it fell below the fold
  // with no scroll cue and read as "the button did nothing". This floats over the
  // ring, fades in, holds, fades out, and clears itself — no layout growth.
  const controlErrorOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!controlError) return;
    controlErrorOpacity.setValue(0);
    Animated.timing(controlErrorOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    const hideId = setTimeout(() => {
      Animated.timing(controlErrorOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setControlError(null));
    }, CONTROL_ERROR_VISIBLE_MS);
    return () => clearTimeout(hideId);
  }, [controlError, controlErrorOpacity]);

  const handlePauseResume = useCallback(async () => {
    if (!partyId || controlBusy) return;
    setControlError(null);
    setControlBusy(true);
    setBusyControl('pause');
    const result = isPaused
      ? await hostResumeTimer({ partySessionId: partyId })
      : await hostPauseTimer({ partySessionId: partyId });
    setControlBusy(false);
    setBusyControl(null);
    if (result.ok) {
      refreshSession();
      return;
    }
    setControlError(rpcErrorMessage(result.error_code));
  }, [partyId, controlBusy, isPaused, refreshSession]);

  const handleAddTime = useCallback(
    async (seconds: number) => {
      if (!partyId || controlBusy) return;
      setControlError(null);
      setControlBusy(true);
      setBusyControl(seconds === ADD_TIME_SHORT_SECONDS ? 'short' : 'long');
      const result = await hostAddTime({ partySessionId: partyId, seconds });
      setControlBusy(false);
      setBusyControl(null);
      if (result.ok) {
        refreshSession();
        return;
      }
      setControlError(rpcErrorMessage(result.error_code));
    },
    [partyId, controlBusy, refreshSession],
  );

  // "Round N Results" button → the previous round's recap (current_round_number - 1).
  // Always available once a prior round exists, including after a reconnect that
  // handed over no lastRound* params — results resolves the id from the number then.
  // Hidden on round 1 (no previous round) and in single-phone mode.
  const lastRoundNum = lastRoundNumber ? Number(lastRoundNumber) : null;
  const prevRoundNumber =
    session?.current_round_number != null ? session.current_round_number - 1 : null;
  const showLastResults = !hostOnly && prevRoundNumber !== null && prevRoundNumber >= 1;

  const viewLastResults = useCallback(() => {
    if (!partyId || prevRoundNumber === null) return;
    // Fast path: reuse the handed-over roundId when it IS the previous round; else
    // pass just the number and let the results screen resolve the id.
    const fastRoundId = lastRoundId && lastRoundNum === prevRoundNumber ? lastRoundId : undefined;
    router.push({
      pathname: '/party/[partyId]/results',
      params: {
        partyId,
        roundNumber: String(prevRoundNumber),
        review: '1',
        ...(fastRoundId ? { roundId: fastRoundId } : {}),
      },
    });
  }, [partyId, prevRoundNumber, lastRoundId, lastRoundNum]);

  // I'm Out during the countdown — mark_self_out is legal in countdown or
  // shot_window (rpc-contracts §7.3). Opting out here records a self_out for the
  // current round; the player goes out at round finalization (game-rules §7).
  const [actingOut, setActingOut] = useState(false);
  const [outError, setOutError] = useState<string | null>(null);
  const isActive = me?.status === 'active';
  const isOut = me?.status === 'out';
  const selfOutRecorded = myOutcome?.player_action === 'self_out';
  // Done can't be recorded during countdown (mark_done is shot_window-only), but
  // mirror the shot screen's rule for consistency: a recorded Done closes I'm Out.
  const doneRecorded = myOutcome?.player_action === 'done';
  const canSelfOut = isActive && !doneRecorded && !selfOutRecorded && !actingOut;

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

  const handleSelfOut = useCallback(async () => {
    if (!partyId || !canSelfOut) return;
    setOutError(null);
    setActingOut(true);

    const result = await markSelfOut({ partySessionId: partyId });
    setActingOut(false);

    if (result.ok) {
      refreshOutcome();
      return;
    }
    setOutError(rpcErrorMessage(result.error_code));
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

  // Ring fills clockwise as the proportion of the countdown remaining. Total is
  // the round's interval; clamp (in ProgressRing) guards against host_add_time
  // pushing remaining past the original interval.
  const intervalMs = (currentRound?.interval_seconds ?? 0) * 1000;
  const ringProgress = intervalMs > 0 ? displayMs / intervalMs : 0;

  // When the server advances the phase (the poll in useTimerSession transitions
  // countdown → shot_window, or the host ends the party), the snapshot's
  // current_phase changes — route to that phase's screen. Staying on 'countdown'
  // keeps us here for round N+1. This is the consumer side of the timer's
  // server-authoritative transition (CLAUDE.md §2.1).
  //
  // Suppressed while `leaving`: useGameExit's host path already routes to the
  // summary on end_party, and the poll can still catch 'shot_window' mid-exit —
  // either would re-route us right after that. The intentional exit wins. 'ended'
  // is handled below (route to the summary, not via routeForPhase).
  const currentPhase = session?.current_phase;
  useEffect(() => {
    if (
      leaving ||
      membershipLost ||
      partyEnded ||
      status !== 'ready' ||
      !partyId ||
      !currentPhase ||
      currentPhase === 'countdown'
    ) {
      return;
    }
    // The party ended (e.g. the screen loaded after end_party, so the snapshot read
    // it directly) → Final Summary (Phase 11).
    if (currentPhase === 'ended') {
      router.replace(`/party/${partyId}/summary`);
      return;
    }
    router.replace(`/party/${partyId}/${routeForPhase(currentPhase)}`);
  }, [leaving, membershipLost, partyEnded, status, currentPhase, partyId]);

  // Host ended the party — read live off the party_sessions realtime payload
  // (useTimerSession.partyEnded), so we route on even if a get_party_state refresh
  // would have failed. End Party lands every device on the Final Summary (Phase 11).
  useEffect(() => {
    if (partyEnded && partyId) router.replace(`/party/${partyId}/summary`);
  }, [partyEnded, partyId]);

  // The host removed us mid-game — surface why, then return home. Same message as
  // the lobby (useLobby membershipLost). Driven by the realtime party_players sub.
  useEffect(() => {
    if (!membershipLost) return;
    Alert.alert(
      'Removed from party',
      "The host removed you from this party. You won't be able to rejoin.",
    );
    router.replace('/');
  }, [membershipLost]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ErrorBanner message={errorMessage} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.headerBar}>
        {/* Top-left: a back-style jump to the round that just finished. Hidden on
            round 1 / a reconnect that skipped results (then an empty spacer keeps
            the settings icon right-aligned). Not an app-exit — the footer's
            End Party / Leave Party handles that. */}
        {showLastResults ? (
          <Pressable
            onPress={viewLastResults}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.lastResultsButton}
          >
            <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textSecondary} />
            <Text style={styles.lastResultsText}>Round {prevRoundNumber} Results</Text>
          </Pressable>
        ) : (
          <View />
        )}

        {/* Top-right: per-session party settings (Surface B, D062), opened by every
            player, host or not. Per-session notification overrides for all; the host
            additionally gets the party-lock row there. (Distinct from the Home gear's
            global app-level settings.) */}
        <Pressable
          onPress={() => router.push({ pathname: '/party/[partyId]/settings', params: { partyId } })}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.header}>
        {isHost && !hostOnly ? (
          <Pressable onPress={() => setJoinCodeOpen(true)} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.partyName, styles.partyNameTappable]}>{session?.name}</Text>
          </Pressable>
        ) : (
          <Text style={styles.partyName}>{session?.name}</Text>
        )}
        <Text style={styles.subtitle}>Round {session?.current_round_number}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ringLabel}>NEXT SHOT O&apos;CLOCK IN:</Text>

        {/* Real remaining time, draining clockwise. The server-driven transition
            into the shot window is the advance_phase_if_due poll (useTimerSession).
            Host only: the time sits at true centre and the pause/play button is
            pinned near the bottom of the circle interior; +30s / +1m circles float
            at the lower corners. A player sees just the centred time. */}
        <View style={styles.ringArea}>
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={10}
            progress={ringProgress}
            color={COLORS.brandPrimary} // backgroundColor: COLORS.surface
            trackColor={COLORS.trackColor}
          >
            <View style={styles.ringContent}>
              {/* The time stays centred; a paused player gets a PAUSED label just
                  below it, the host gets the pause/play control near the bottom. */}
              <Text style={styles.ringTime}>{formatDuration(displayMs)}</Text>
              {!isHost && isPaused ? (
                <View style={styles.pausedLabelSlot}>
                  <Text style={styles.pausedLabel}>❚❚ PAUSED</Text>
                </View>
              ) : null}
              {isHost ? (
                <View style={styles.pauseSlot}>
                  <Pressable
                    onPress={handlePauseResume}
                    disabled={controlBusy}
                    accessibilityRole="button"
                    accessibilityLabel={isPaused ? 'Resume timer' : 'Pause timer'}
                    style={({ pressed }) => [
                      styles.pauseButton,
                      pressed && styles.controlPressed,
                      busyControl === 'pause' && styles.controlDisabled,
                    ]}
                  >
                    <Text style={styles.pauseIcon}>{isPaused ? '▶' : '❚❚'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ProgressRing>

          {isHost ? (
            <>
              <CircleControl
                label="+30s"
                onPress={() => void handleAddTime(ADD_TIME_SHORT_SECONDS)}
                disabled={controlBusy}
                busy={busyControl === 'short'}
                style={styles.addLeft}
              />
              <CircleControl
                label="+1m"
                onPress={() => void handleAddTime(ADD_TIME_LONG_SECONDS)}
                disabled={controlBusy}
                busy={busyControl === 'long'}
                style={styles.addRight}
              />
            </>
          ) : null}
        </View>

      </ScrollView>

      {/* Control-error toast — absolute so it never grows the scroll content or
          hides below the fold. Floats over the upper ring area, fades in/out, and
          self-clears (CONTROL_ERROR_VISIBLE_MS). pointerEvents none so taps still
          reach the +time / pause controls beneath it. */}
      {isHost && controlError ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.controlToast, { opacity: controlErrorOpacity }]}
        >
          <ErrorBanner message={controlError} />
        </Animated.View>
      ) : null}

      <View style={styles.footer}>
        {/* Out player: the "you're out" note + tally sits ABOVE the buttons, which
            stay in their low position; no I'm Out action. */}
        {isOut ? (
          <View style={styles.outNote}>
            <Text style={styles.outNoteTitle}>You&apos;re out</Text>
            <Text style={styles.outNoteSub}>
              You took {me?.total_shots_completed ?? 0}{' '}
              {me?.total_shots_completed === 1 ? 'shot' : 'shots'}
            </Text>
          </View>
        ) : null}

        <View style={styles.footerRow}>
          {/* Destructive exit: a host ends the party, a player leaves it. Both go
              through the same confirmExit flow (useGameExit, D032). */}
          <Button
            label={isHost ? 'End Party' : 'Leave Party'}
            variant="outline"
            onPress={() => confirmExit({ isHost, hostOnly })}
            disabled={leaving}
            style={[styles.footerButton, styles.destructiveButton]}
          />
          {/* No roster in single-phone mode — there are no other players (D040). */}
          {!hostOnly ? (
            <Button
              label="Players"
              variant="outline"
              onPress={() => setRosterOpen(true)}
              style={styles.footerButton}
            />
          ) : null}
        </View>

        {/* Active player: the I'm Out / Skip action stays below the buttons. Hidden
            in single-phone mode — the host is the only player and never self-outs. */}
        {!isOut && !hostOnly ? (
          <>
            <ErrorBanner message={outError} />
            <Button
              label={selfOutLabel}
              variant="outline"
              onPress={confirmSelfOut}
              disabled={!canSelfOut}
              style={styles.selfOutFill}
            />
          </>
        ) : null}
      </View>

      {partyId && !hostOnly ? (
        <RosterSheet
          visible={rosterOpen}
          onClose={() => setRosterOpen(false)}
          players={players}
          currentRoundOutcomes={roundOutcomes}
          currentRoundNumber={session?.current_round_number ?? 0}
          graceMode={settings?.grace_mode ?? 'disabled'}
          currentUserId={me?.user_id ?? null}
          isHost={isHost}
          onApplied={refreshSession}
        />
      ) : null}

      {/* Join-code popover (multi-device host only). Tapping the dim backdrop
          (anywhere outside the card) dismisses; the card swallows its own taps.
          Never mounted in single-phone mode — no code is shared (D040). */}
      {isHost && !hostOnly ? (
        <Modal
          visible={joinCodeOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setJoinCodeOpen(false)}
        >
          <Pressable style={styles.popoverBackdrop} onPress={() => setJoinCodeOpen(false)}>
            <Pressable style={styles.popoverCard} onPress={() => {}}>
              <Text style={styles.popoverCode}>{session?.join_code}</Text>
              <Text style={styles.popoverHint}>Share this code so others can join.</Text>
              <Pressable
                onPress={() => {
                  if (session?.join_code) void shareJoinCode(session?.name, session.join_code);
                }}
                accessibilityRole="button"
                accessibilityLabel="Share join code"
                style={styles.popoverShareButton}
                hitSlop={8}
              >
                <Ionicons
                  name="share-outline"
                  size={POPOVER_SHARE_ICON_SIZE}
                  color={COLORS.buttonFilledText}
                />
                <Text style={styles.popoverShareText}>Share code</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

// Small circular floating control for the +time buttons at the ring's corners.
function CircleControl({
  label,
  onPress,
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  style: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [
        styles.circle,
        style,
        pressed && styles.controlPressed,
        busy && styles.controlDisabled,
      ]}
    >
      <Text style={styles.circleLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Timer layout knobs ───────────────────────────────────────────────────────
// Tune the ring and host controls here — all in px. Each is consumed by the
// `styles` block below (and `size={RING_SIZE}` on the ProgressRing). Adjust freely.
const RING_SIZE = 280; // ring diameter
const RING_TIME_FONT_SIZE = 60; // the M:SS time text inside the ring
const PAUSE_BUTTON_SIZE = 72; // host pause/play button (centre-bottom of the ring)
const ADD_TIME_BUTTON_SIZE = 64; // host +30s / +1m circles
const ADD_TIME_BUTTON_OFFSET = 44; // how far the +time circles sit outside the ring's sides
const HEADER_ICON_SIZE = 22; // header back-arrow + settings-gear icons
const POPOVER_SHARE_ICON_SIZE = 16; // join-code popover "Share code" button icon
// ──────────────────────────────────────────────────────────────────────────────

// Quick add-time amounts (seconds). host_add_time bounds input to 1–600.
const ADD_TIME_SHORT_SECONDS = 30;
const ADD_TIME_LONG_SECONDS = 60;

// How long the control-error toast holds (ms) before it fades out and clears.
const CONTROL_ERROR_VISIBLE_MS = 2800;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  // Row so the back arrow sits inline before the label, reading as a nav button.
  lastResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  lastResultsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  partyName: {
    fontSize: FONT_SIZE.custom_1,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  // Host's tappable party name (opens the join-code popover) — underlined to read
  // as interactive.
  partyNameTappable: {
    textDecorationLine: 'underline',
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  content: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.xl,
  },
  // Transient overlay for control errors — absolute so it never affects layout or
  // sits below the fold. Anchored in the upper area, centred, non-interactive.
  controlToast: {
    position: 'absolute',
    top: '20%',
    left: SPACING.lg,
    right: SPACING.lg,
    alignItems: 'center',
  },
  // Nudged down so it stays close to the repositioned (lower) ring.
  ringLabel: {
    marginTop: SPACING.xl,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  // Square that bounds the ring; the +time circles float at its lower corners.
  ringArea: {
    width: RING_SIZE,
    height: RING_SIZE,
    marginTop: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fills the ring so the time sits at true centre and the pause button (absolute)
  // can pin to the bottom of the circle interior.
  ringContent: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTime: {
    fontSize: RING_TIME_FONT_SIZE,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  // Sits just below the centred time (which stays put), so PAUSED reads as an
  // annotation under the clock rather than replacing it.
  pausedLabelSlot: {
    position: 'absolute',
    top: '63%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pausedLabel: {
    fontSize: FONT_SIZE.custom_1,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: 1,
    color: COLORS.textSecondary,
    opacity: 0.8,
  },
  // Host pause/play, pinned near the bottom of the circle interior.
  pauseSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: SPACING.lg,
    alignItems: 'center',
  },
  pauseButton: {
    width: PAUSE_BUTTON_SIZE,
    height: PAUSE_BUTTON_SIZE,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: `${COLORS.black}99`, // softened
    opacity: 0.9, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: {
    fontSize: FONT_SIZE.custom_1,
    color: COLORS.textPrimary,
  },
  // The +time circles sit below and outside the ring's lower corners — negative
  // offsets (ADD_TIME_BUTTON_OFFSET) push them clear of the ring arc.
  circle: {
    position: 'absolute',
    bottom: -SPACING.xxl,
    width: ADD_TIME_BUTTON_SIZE,
    height: ADD_TIME_BUTTON_SIZE,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: `${COLORS.black}99`, // softened
    opacity: 0.8, // a touch transparent so the controls recede
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLeft: {
    left: -ADD_TIME_BUTTON_OFFSET,
  },
  addRight: {
    right: -ADD_TIME_BUTTON_OFFSET,
  },
  circleLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  controlPressed: {
    opacity: 0.6,
  },
  controlDisabled: {
    opacity: 0.4,
  },
  footer: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  // Replaces the I'm Out button for an out player: a plain note + their tally.
  outNote: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  outNoteTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
  },
  outNoteSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  footerButton: {
    flex: 1,
    // Raised fill so the footer actions read as buttons on the grey canvas, not
    // flat transparent outlines.
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.brandPrimary,
    borderWidth: 2,
  },
  // The round action (Use Grace / I'm Out / Skip) — soft-Highlight fill + Indigo
  // border, so it reads as the distinct action vs the neutral Players / danger exit.
  selfOutFill: {
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.black,
    borderWidth: 2,
  },
  // Danger-tinted border marks the destructive exit (End / Leave Party) without a
  // third Button variant; the label keeps the default outline color.
  destructiveButton: {
    borderColor: COLORS.danger,
  },
  // Join-code popover (host). Backdrop fills the screen and centres the card near
  // the top, under the tapped party name.
  popoverBackdrop: {
    flex: 1,
    alignItems: 'center',
    paddingTop: SPACING.xxl * 2,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  // Join-code popover styled to match the host lobby's share-code card: a Navy
  // surface with white code + a white-outline Share button.
  popoverCard: {
    backgroundColor: COLORS.buttonFilled,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  popoverCode: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 2,
    color: COLORS.buttonFilledText,
  },
  popoverHint: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.buttonFilledText,
    opacity: 0.7,
  },
  popoverShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.buttonFilledText,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  popoverShareText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.buttonFilledText,
  },
});
