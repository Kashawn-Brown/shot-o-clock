// Shot O'Clock — the full-screen "take your shot now" moment. This is the ONLY
// dark-background surface in the app.
//
// Because the background is black, the shared Button (built for light screens)
// doesn't fit — the actions are inverted (white Done, red I'm Out), so they're
// drawn inline here.
//
// Phase 8 task 1: the ring shows the REAL shot-window countdown, computed from the
// session's phase_ends_at minus skew-corrected server time (useCountdown) — no
// client owns the timer (CLAUDE.md §2.1). This screen reuses the same started-party
// machinery as the timer (useTimerSession): it loads the snapshot once, aligns the
// clock, and polls advance_phase_if_due so the window closes on the server's
// schedule. When the server advances out of the shot window — into countdown for
// round N+1, or into the round_complete halt — current_phase changes and the route
// effect carries every device onto the next screen together.
//
// Still inert this task: Done / I'm Out. Wiring them to mark_done / mark_self_out
// (with optimistic feedback and the non-active disabled state) is Phase 8 task 2.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useCountdown } from '@/features/game/useCountdown';
import { routeForPhase } from '@/features/party/reconnectRoute';
import { useTimerSession } from '@/features/party/useTimerSession';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function ShotOClockScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { status, session, errorMessage } = useTimerSession(partyId);
  const { remainingMs } = useCountdown(session?.phase_ends_at ?? null);

  // When the server advances the phase (the poll in useTimerSession closes the
  // shot window → countdown for round N+1, or → round_complete on the zero-active
  // halt), the snapshot's current_phase changes — route to that phase's screen.
  // Staying on 'shot_window' keeps us here. This is the consumer side of the
  // timer's server-authoritative transition (CLAUDE.md §2.1), mirroring timer.tsx.
  const currentPhase = session?.current_phase;
  useEffect(() => {
    if (status !== 'ready' || !partyId || !currentPhase || currentPhase === 'shot_window') {
      return;
    }
    router.replace(`/party/${partyId}/${routeForPhase(currentPhase)}`);
  }, [status, currentPhase, partyId]);

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

      <View style={styles.center}>
        <Text style={styles.title}>SHOT{'\n'}O&apos;CLOCK</Text>

        <View style={styles.ring}>
          <Text style={styles.ringLabel}>SHOT WINDOW</Text>
          <Text style={styles.ringTime}>{formatDuration(remainingMs)}</Text>
        </View>
      </View>

      {/* Inert this task. mark_done / mark_self_out + the non-active disabled
          state are Phase 8 task 2. */}
      <View style={styles.actions}>
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
    justifyContent: 'space-between',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
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
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 8,
    borderColor: COLORS.shotRing,
    borderTopColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
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
