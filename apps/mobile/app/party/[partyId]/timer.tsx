// Timer — the between-shots countdown. Single file that adapts for host vs
// player: the host gets the pause button inside the ring, Add 30s / Add 1 min,
// and the Host Controls section; a player sees only the ring, View Roster, and
// I'm Out.
//
// Phase 3 placeholder: the ring is a static styled circle (a real SVG progress
// ring arrives with the live timer in Phase 7) and the time is computed through
// formatDuration to exercise the helper. No server timer, no RPCs. Tapping the
// ring simulates the server-driven transition to the Shot O'Clock window.

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// 7 minutes 42 seconds — matches the wireframe; placeholder value only.
const PLACEHOLDER_REMAINING_MS = (7 * 60 + 42) * 1000;

export default function TimerScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.partyName}>Friday Night Shots</Text>
        <Text style={styles.subtitle}>Round 3 · Shot #3</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ringLabel}>NEXT SHOT O&apos;CLOCK IN</Text>

        {/* Tapping the ring stands in for the server-driven shot transition. */}
        <Pressable onPress={() => router.push(`/party/${partyId}/shot-oclock`)} style={styles.ring}>
          <Text style={styles.ringTime}>{formatDuration(PLACEHOLDER_REMAINING_MS)}</Text>
          <View style={styles.pauseButton}>
            <Text style={styles.pauseIcon}>❚❚</Text>
          </View>
        </Pressable>

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
