// Shot O'Clock — the full-screen "take your shot now" moment. This is the ONLY
// dark-background surface in the app, established here even as a placeholder.
//
// Because the background is black, the shared Button (built for light screens)
// doesn't fit — the actions are inverted (white Done, red I'm Out), so they're
// drawn inline here. Phase 3 placeholder: static ring, no shot-window timer, no
// mark_done / mark_self_out RPCs. Both actions navigate to the results screen.

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDuration } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const PLACEHOLDER_WINDOW_MS = 23 * 1000;

export default function ShotOClockScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const goToResults = (): void => router.push(`/party/${partyId}/results`);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.center}>
        <Text style={styles.title}>SHOT{'\n'}O&apos;CLOCK</Text>

        <View style={styles.ring}>
          <Text style={styles.ringLabel}>SHOT WINDOW</Text>
          <Text style={styles.ringTime}>{formatDuration(PLACEHOLDER_WINDOW_MS)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={goToResults} style={[styles.action, styles.doneAction]}>
          <Text style={styles.doneLabel}>Done ✓</Text>
        </Pressable>
        <Pressable onPress={goToResults} style={[styles.action, styles.outAction]}>
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
