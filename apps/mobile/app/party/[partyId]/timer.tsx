// Timer — the between-shots countdown. Single file that adapts for host vs
// player: the host gets the pause button inside the ring, Add 30s / Add 1 min,
// and the Host Controls section; a player sees only the ring, View Roster, and
// I'm Out.
//
// Phase 7 task 1: the ring shows the REAL countdown, computed from the session's
// phase_ends_at minus skew-corrected server time (useCountdown) — no client owns
// the timer (CLAUDE.md §2.1). useTimerSession loads the party snapshot once on
// mount and aligns the clock. Still placeholder this task: the host controls and
// I'm Out (Phase 8/10), and the actual countdown→shot_window transition, which
// task 2 drives via advance_phase_if_due polling.

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useCountdown } from '@/features/game/useCountdown';
import { useTimerSession } from '@/features/party/useTimerSession';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function TimerScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { status, session, errorMessage } = useTimerSession(partyId);
  const { remainingMs } = useCountdown(session?.phase_ends_at ?? null);

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
      <View style={styles.header}>
        <Text style={styles.partyName}>{session?.name}</Text>
        <Text style={styles.subtitle}>Round {session?.current_round_number}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ringLabel}>NEXT SHOT O&apos;CLOCK IN</Text>

        {/* Real remaining time. The server-driven transition into the shot window
            is wired in Phase 7 task 2 (advance_phase_if_due polling). */}
        <View style={styles.ring}>
          <Text style={styles.ringTime}>{formatDuration(remainingMs)}</Text>
          <View style={styles.pauseButton}>
            <Text style={styles.pauseIcon}>❚❚</Text>
          </View>
        </View>

        <View style={styles.addTimeRow}>
          <Button label="+ Add 30s" variant="outline" onPress={() => {}} style={styles.addTime} />
          <Button label="+ Add 1 min" variant="outline" onPress={() => {}} style={styles.addTime} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Button
            label="Roster"
            variant="outline"
            onPress={() => router.push(`/party/${partyId}/roster`)}
            style={styles.footerButton}
          />
          <Button
            label="Host Controls"
            variant="outline"
            onPress={() => {}}
            style={styles.footerButton}
          />
        </View>
        <Button label="I'm Out" variant="outline" onPress={() => {}} />
        <Button
          label="End Party"
          variant="outline"
          onPress={() => router.push(`/party/${partyId}/summary`)}
        />
      </View>
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
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
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
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 10,
    borderColor: COLORS.buttonFilled,
    borderTopColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  ringTime: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  pauseButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  addTimeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  addTime: {
    flex: 1,
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
