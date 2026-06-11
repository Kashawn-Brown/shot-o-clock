// Timer — the between-shots countdown. Single file that adapts for host vs
// player: the host gets a Host Controls button opening the controls sheet
// (pause/resume, add time); a player sees only the ring, Roster, and I'm Out.
//
// The ring shows the REAL countdown, computed from the session's phase_ends_at
// minus skew-corrected server time (useCountdown) and draining clockwise — no
// client owns the timer (CLAUDE.md §2.1). useTimerSession loads the snapshot,
// aligns the clock, polls advance_phase_if_due to drive the transition, and
// subscribes to the session row so a host pause/resume reflects on every device.
// While paused the ring freezes at paused_remaining_seconds (option (a), §10.1).
//
// The back arrow + End Party are the shared testing escape hatch (useGameExit):
// end_party for the host, mark_self_out → home for a guest. The real in-game
// End Party → Final Summary routing lands in Phase 11.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { HostControlsSheet } from '@/features/party/HostControlsSheet';
import { markSelfOut } from '@/features/party/api/markSelfOut';
import { selfOutCopy } from '@/features/game/selfOutCopy';
import { useCountdown } from '@/features/game/useCountdown';
import { useGameExit } from '@/features/party/useGameExit';
import { routeForPhase } from '@/features/party/reconnectRoute';
import { useTimerSession } from '@/features/party/useTimerSession';
import { rpcErrorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '@/styles/tokens';

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
    refreshOutcome,
    refreshSession,
  } = useTimerSession(partyId);
  const { remainingMs: liveRemainingMs } = useCountdown(session?.phase_ends_at ?? null);
  const { leaving, confirmExit } = useGameExit(partyId);

  // Host-only control surface. The RPCs backstop with NOT_HOST, so this gate is
  // defence in depth, not the only guard (PartyPlayer.permissionRole, §2.4).
  const isHost = me?.permission_role === 'host';
  const isPaused = session?.status === 'paused';
  const [controlsOpen, setControlsOpen] = useState(false);

  // While paused the server freezes the timer under option (a): status → paused,
  // phase_ends_at left intact (§10.1). So the live countdown would keep draining
  // a stale deadline — show the frozen paused_remaining_seconds instead, on every
  // device (the realtime session sub re-pulls the paused status). useCountdown
  // stays pure; we just pick which value to display.
  const remainingMs = isPaused
    ? (session?.paused_remaining_seconds ?? 0) * 1000
    : liveRemainingMs;

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
    if (leaving || status !== 'ready' || !partyId || !currentPhase || currentPhase === 'countdown') {
      return;
    }
    router.replace(`/party/${partyId}/${routeForPhase(currentPhase)}`);
  }, [leaving, status, currentPhase, partyId]);

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
        <Pressable onPress={confirmExit} accessibilityRole="button" hitSlop={8} disabled={leaving}>
          <Text style={styles.back}>←</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.partyName}>{session?.name}</Text>
        <Text style={styles.subtitle}>Round {session?.current_round_number}</Text>
      </View>

      {showLastResults ? (
        <Pressable onPress={viewLastResults} accessibilityRole="button" style={styles.lastResults} hitSlop={8}>
          <Text style={styles.lastResultsText}>← Round {lastRoundNumber} Results</Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ringLabel}>NEXT SHOT O&apos;CLOCK IN</Text>

        {/* Real remaining time, draining clockwise. The server-driven transition
            into the shot window is the advance_phase_if_due poll (useTimerSession). */}
        <ProgressRing
          size={RING_SIZE}
          strokeWidth={10}
          progress={ringProgress}
          color={COLORS.buttonFilled}
          trackColor={COLORS.border}
        >
          <View style={styles.ringContent}>
            <Text style={styles.ringTime}>{formatDuration(remainingMs)}</Text>
            {/* Pause/resume + add time now live in the Host Controls sheet; the
                ring just reflects the frozen state. */}
            {isPaused ? <Text style={styles.pausedLabel}>❚❚ PAUSED</Text> : null}
          </View>
        </ProgressRing>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Button
            label="Roster"
            variant="outline"
            onPress={() => router.push(`/party/${partyId}/roster`)}
            style={styles.footerButton}
          />
          {isHost ? (
            <Button
              label="Host Controls"
              variant="outline"
              onPress={() => setControlsOpen(true)}
              style={styles.footerButton}
            />
          ) : null}
        </View>
        <ErrorBanner message={outError} />
        <Button
          label={selfOutLabel}
          variant="outline"
          onPress={confirmSelfOut}
          disabled={!canSelfOut}
        />
        {/* Host's End Party now lives in the Host Controls sheet; a guest keeps
            this footer button as their escape-hatch exit (useGameExit). */}
        {!isHost ? (
          <Button label="End Party" variant="outline" onPress={confirmExit} disabled={leaving} />
        ) : null}
      </View>

      {isHost && partyId ? (
        <HostControlsSheet
          visible={controlsOpen}
          onClose={() => setControlsOpen(false)}
          isPaused={!!isPaused}
          partySessionId={partyId}
          onApplied={refreshSession}
          onEndParty={confirmExit}
          endingParty={leaving}
        />
      ) : null}
    </SafeAreaView>
  );
}

const RING_SIZE = 240;

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
  lastResults: {
    alignSelf: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
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
  footer: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  footerButton: {
    flex: 1,
  },
});
