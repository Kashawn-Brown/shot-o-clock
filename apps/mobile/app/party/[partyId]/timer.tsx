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
// The back arrow + End/Leave Party are the shared escape hatch (useGameExit):
// end_party for the host, mark_self_out → home for a guest (D032). The real
// End Party → Final Summary routing lands in Phase 11.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { routeForPhase } from '@/features/party/reconnectRoute';
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
    errorMessage,
    membershipLost,
    players,
    refreshOutcome,
    refreshSession,
  } = useTimerSession(partyId);
  const { remainingMs: liveRemainingMs } = useCountdown(session?.phase_ends_at ?? null);
  const { leaving, confirmExit } = useGameExit(partyId);

  // The caller's role drives the host-only roster controls (Mark Out / Reinstate /
  // Remove live in the Roster sheet) and the destructive bottom-left button: a
  // host ends the party, a player leaves it. RPCs backstop with NOT_HOST, so the
  // gate is defence in depth (PartyPlayer.permissionRole, §2.4).
  const isHost = me?.permission_role === 'host';
  const isPaused = session?.status === 'paused';
  const [rosterOpen, setRosterOpen] = useState(false);

  // While paused the server freezes the timer under option (a): status → paused,
  // phase_ends_at left intact (§10.1). So the live countdown would keep draining
  // a stale deadline — show the frozen paused_remaining_seconds instead, on every
  // device (the realtime session sub delivers the paused status). useCountdown
  // stays pure; we just pick which value to display.
  const remainingMs = isPaused
    ? (session?.paused_remaining_seconds ?? 0) * 1000
    : liveRemainingMs;

  // Host timer controls (pause/resume, add time) — integrated onto the ring, not a
  // sheet. One in-flight lock across them; add_time isn't idempotent, so the lock
  // is what stops a double-tap stacking two extensions (hostAddTime.ts). Errors
  // surface in a small banner under the ring. On success refreshSession re-pulls so
  // the host's screen updates without waiting on the realtime round-trip.
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  const handlePauseResume = useCallback(async () => {
    if (!partyId || controlBusy) return;
    setControlError(null);
    setControlBusy(true);
    const result = isPaused
      ? await hostResumeTimer({ partySessionId: partyId })
      : await hostPauseTimer({ partySessionId: partyId });
    setControlBusy(false);
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
      const result = await hostAddTime({ partySessionId: partyId, seconds });
      setControlBusy(false);
      if (result.ok) {
        refreshSession();
        return;
      }
      setControlError(rpcErrorMessage(result.error_code));
    },
    [partyId, controlBusy, refreshSession],
  );

  // "Round N Results" button: only when the handed-over round is genuinely the one
  // just before this countdown (current_round_number - 1). This self-updates each
  // cycle — the timer remounts per round with a fresh lastRound* — and stays hidden
  // on round 1 and on a reconnect that never passed through results.
  const lastRoundNum = lastRoundNumber ? Number(lastRoundNumber) : null;
  const showLastResults =
    !!lastRoundId &&
    lastRoundNum !== null &&
    session?.current_round_number != null &&
    lastRoundNum === session.current_round_number - 1;

  const viewLastResults = useCallback(() => {
    if (!partyId || !lastRoundId) return;
    router.push({
      pathname: '/party/[partyId]/results',
      params: { partyId, roundId: lastRoundId, roundNumber: lastRoundNumber ?? '', review: '1' },
    });
  }, [partyId, lastRoundId, lastRoundNumber]);

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

  // Confirmation gate — opting out is irreversible within the round (game-rules §7);
  // the message reflects the actual consequence (grace / elimination-off / out).
  const confirmSelfOut = useCallback(() => {
    if (!canSelfOut) return;
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmButton, style: 'destructive', onPress: handleSelfOut },
    ]);
  }, [canSelfOut, handleSelfOut, confirmTitle, confirmMessage, confirmButton]);

  // Ring fills clockwise as the proportion of the countdown remaining. Total is
  // the round's interval; clamp (in ProgressRing) guards against host_add_time
  // pushing remaining past the original interval.
  const intervalMs = (currentRound?.interval_seconds ?? 0) * 1000;
  const ringProgress = intervalMs > 0 ? remainingMs / intervalMs : 0;

  // When the server advances the phase (the poll in useTimerSession transitions
  // countdown → shot_window, or the host ends the party), the snapshot's
  // current_phase changes — route to that phase's screen. Staying on 'countdown'
  // keeps us here for round N+1. This is the consumer side of the timer's
  // server-authoritative transition (CLAUDE.md §2.1).
  //
  // Suppressed while `leaving`: the exit flips the phase (end_party → 'ended') and
  // the poll can still catch 'shot_window' mid-exit, either of which would re-route
  // us right after useGameExit's router.replace('/'). The intentional exit wins.
  const currentPhase = session?.current_phase;
  useEffect(() => {
    if (
      leaving ||
      membershipLost ||
      status !== 'ready' ||
      !partyId ||
      !currentPhase ||
      currentPhase === 'countdown'
    ) {
      return;
    }
    router.replace(`/party/${partyId}/${routeForPhase(currentPhase)}`);
  }, [leaving, membershipLost, status, currentPhase, partyId]);

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
        <Pressable
          onPress={() => confirmExit({ isHost })}
          accessibilityRole="button"
          hitSlop={8}
          disabled={leaving}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>

        {/* Quick jump back to the round that just finished — top-right of the
            header, hidden on round 1 / a reconnect that skipped results. */}
        {showLastResults ? (
          <Pressable onPress={viewLastResults} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lastResultsText}>Round {lastRoundNumber} Results</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.header}>
        <Text style={styles.partyName}>{session?.name}</Text>
        <Text style={styles.subtitle}>Round {session?.current_round_number}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ringLabel}>NEXT SHOT O&apos;CLOCK IN</Text>

        {/* Real remaining time, draining clockwise. The server-driven transition
            into the shot window is the advance_phase_if_due poll (useTimerSession).
            Host controls are integrated onto the ring: a pause/play button at its
            centre, and +30s / +1m circles floating at the lower corners. */}
        <View style={styles.ringArea}>
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={10}
            progress={ringProgress}
            color={COLORS.buttonFilled}
            trackColor={COLORS.border}
          >
            <View style={styles.ringContent}>
              <Text style={styles.ringTime}>{formatDuration(remainingMs)}</Text>
              {isHost ? (
                <Pressable
                  onPress={handlePauseResume}
                  disabled={controlBusy}
                  accessibilityRole="button"
                  accessibilityLabel={isPaused ? 'Resume timer' : 'Pause timer'}
                  style={({ pressed }) => [
                    styles.pauseButton,
                    pressed && styles.controlPressed,
                    controlBusy && styles.controlDisabled,
                  ]}
                >
                  <Text style={styles.pauseIcon}>{isPaused ? '▶' : '❚❚'}</Text>
                </Pressable>
              ) : isPaused ? (
                <Text style={styles.pausedLabel}>❚❚ PAUSED</Text>
              ) : null}
            </View>
          </ProgressRing>

          {isHost ? (
            <>
              <CircleControl
                label="+30s"
                onPress={() => void handleAddTime(ADD_TIME_SHORT_SECONDS)}
                disabled={controlBusy}
                style={styles.addLeft}
              />
              <CircleControl
                label="+1m"
                onPress={() => void handleAddTime(ADD_TIME_LONG_SECONDS)}
                disabled={controlBusy}
                style={styles.addRight}
              />
            </>
          ) : null}
        </View>

        {isHost ? <ErrorBanner message={controlError} /> : null}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          {/* Destructive exit: a host ends the party, a player leaves it. Both go
              through the same confirmExit flow (useGameExit, D032). */}
          <Button
            label={isHost ? 'End Party' : 'Leave Party'}
            variant="outline"
            onPress={() => confirmExit({ isHost })}
            disabled={leaving}
            style={[styles.footerButton, styles.destructiveButton]}
          />
          <Button
            label="Players"
            variant="outline"
            onPress={() => setRosterOpen(true)}
            style={styles.footerButton}
          />
        </View>
        {/* Out players have no action — the I'm Out / Skip button is replaced with
            a plain "you're out" note and their shot tally (matches shot-oclock). */}
        {isOut ? (
          <View style={styles.outNote}>
            <Text style={styles.outNoteTitle}>You&apos;re out</Text>
            <Text style={styles.outNoteSub}>
              You took {me?.total_shots_completed ?? 0}{' '}
              {me?.total_shots_completed === 1 ? 'shot' : 'shots'}
            </Text>
          </View>
        ) : (
          <>
            <ErrorBanner message={outError} />
            <Button
              label={selfOutLabel}
              variant="outline"
              onPress={confirmSelfOut}
              disabled={!canSelfOut}
            />
          </>
        )}
      </View>

      {partyId ? (
        <RosterSheet
          visible={rosterOpen}
          onClose={() => setRosterOpen(false)}
          partyName={session?.name ?? ''}
          players={players}
          graceMode={settings?.grace_mode ?? 'disabled'}
          currentUserId={me?.user_id ?? null}
          isHost={isHost}
          onApplied={refreshSession}
        />
      ) : null}
    </SafeAreaView>
  );
}

// Small circular floating control for the +time buttons at the ring's corners.
function CircleControl({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
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
        disabled && styles.controlDisabled,
      ]}
    >
      <Text style={styles.circleLabel}>{label}</Text>
    </Pressable>
  );
}

const RING_SIZE = 240;
// Quick add-time amounts (seconds). host_add_time bounds input to 1–600.
const ADD_TIME_SHORT_SECONDS = 30;
const ADD_TIME_LONG_SECONDS = 60;

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
  back: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  lastResultsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  partyName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  content: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.xl,
  },
  ringLabel: {
    fontSize: FONT_SIZE.sm,
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  // Square that bounds the ring; the +time circles float at its lower corners.
  // Nudged down so the ring sits nearer the screen's vertical centre.
  ringArea: {
    width: RING_SIZE,
    height: RING_SIZE,
    marginTop: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContent: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  ringTime: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  pausedLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  pauseButton: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  // The +time circles sit below and outside the ring's lower corners — negative
  // offsets push them clear of the ring arc so they never overlap it.
  circle: {
    position: 'absolute',
    bottom: -SPACING.md,
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLeft: {
    left: -SPACING.lg,
  },
  addRight: {
    right: -SPACING.lg,
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
  },
  // Danger-tinted border marks the destructive exit (End / Leave Party) without a
  // third Button variant; the label keeps the default outline color.
  destructiveButton: {
    borderColor: COLORS.danger,
  },
});
