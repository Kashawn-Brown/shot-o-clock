// Shot O'Clock — the full-screen "take your shot now" moment. This is the ONLY
// dark-background surface in the app.
//
// Because the background is black, the shared Button (built for light screens)
// doesn't fit — the actions are inverted (white Done, red I'm Out), so they're
// drawn inline here.
//
// Phase 8 task 1: the ring shows the REAL shot-window countdown, computed from the
// session's phase_ends_at minus skew-corrected server time (useCountdown), and
// drains clockwise as the proportion of the shot window remaining — no client owns
// the timer (CLAUDE.md §2.1). This screen reuses the same started-party machinery
// as the timer (useTimerSession): it loads the snapshot once, aligns the clock,
// and polls advance_phase_if_due so the window closes on the server's schedule.
// When the server advances out of the shot window — into countdown for round N+1,
// or into the round_complete halt — current_phase changes and the route effect
// carries every device onto the next screen together.
//
// The back arrow + End Party are a TESTING escape hatch (same pattern as the
// timer): try end_party (host) and fall back to leave_party (guest) on NOT_HOST.
// The real in-game host controls land in Phase 10.
//
// Still inert this task: Done / I'm Out. Wiring them to mark_done / mark_self_out
// (with optimistic feedback and the non-active disabled state) is Phase 8 task 2.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { endParty } from '@/features/party/api/endParty';
import { leaveParty } from '@/features/party/api/leaveParty';
import { useCountdown } from '@/features/game/useCountdown';
import { routeForPhase } from '@/features/party/reconnectRoute';
import { useTimerSession } from '@/features/party/useTimerSession';
import { rpcErrorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function ShotOClockScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { status, session, settings, errorMessage } = useTimerSession(partyId);
  const { remainingMs } = useCountdown(session?.phase_ends_at ?? null);

  const [leaving, setLeaving] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

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
  // Suppressed while `leaving`: end_party flips the phase to 'ended' and the poll
  // can still catch a transition mid-exit, either of which would re-route us right
  // after handleExit's router.replace('/'). The intentional exit wins.
  const currentPhase = session?.current_phase;
  useEffect(() => {
    if (leaving || status !== 'ready' || !partyId || !currentPhase || currentPhase === 'shot_window') {
      return;
    }
    router.replace(`/party/${partyId}/${routeForPhase(currentPhase)}`);
  }, [leaving, status, currentPhase, partyId]);

  // Exit the party and return home. Role-agnostic: try end_party (host), fall
  // back to leave_party (guest) on NOT_HOST. Testing-only until Phase 10's host
  // controls. Note leave_party is lobby-only (rpc-contracts §4.3), so a guest
  // mid-game gets ILLEGAL_TRANSITION here — the host path is the one that works.
  const handleExit = useCallback(async () => {
    if (!partyId || leaving) return;

    setExitError(null);
    setLeaving(true);

    const ended = await endParty({ partySessionId: partyId });
    if (ended.ok) {
      router.replace('/');
      return;
    }

    if (ended.error_code === 'NOT_HOST') {
      const left = await leaveParty({ partySessionId: partyId });
      if (left.ok) {
        router.replace('/');
        return;
      }
      setExitError(rpcErrorMessage(left.error_code));
      setLeaving(false);
      return;
    }

    setExitError(rpcErrorMessage(ended.error_code));
    setLeaving(false);
  }, [partyId, leaving]);

  // Confirmation gate — exiting ends the party for a host.
  const confirmExit = useCallback(() => {
    if (leaving) return;
    Alert.alert('Leave party?', 'If you are the host, this ends the party for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: handleExit },
    ]);
  }, [leaving, handleExit]);

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

        <ProgressRing
          size={RING_SIZE}
          strokeWidth={8}
          progress={ringProgress}
          color={COLORS.shotRing}
          trackColor="rgba(255,255,255,0.2)"
          centerColor={COLORS.shotBackground}
        >
          <View style={styles.ringContent}>
            <Text style={styles.ringLabel}>SHOT WINDOW</Text>
            <Text style={styles.ringTime}>{formatDuration(remainingMs)}</Text>
          </View>
        </ProgressRing>
      </View>

      {/* Inert this task. mark_done / mark_self_out + the non-active disabled
          state are Phase 8 task 2. */}
      <View style={styles.actions}>
        <ErrorBanner message={exitError} />
        <Pressable onPress={() => {}} style={[styles.action, styles.doneAction]}>
          <Text style={styles.doneLabel}>Done ✓</Text>
        </Pressable>
        <Pressable onPress={() => {}} style={[styles.action, styles.outAction]}>
          <Text style={styles.outLabel}>I&apos;m Out</Text>
        </Pressable>
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
  ringContent: {
    alignItems: 'center',
    gap: SPACING.xs,
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
  action: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
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
