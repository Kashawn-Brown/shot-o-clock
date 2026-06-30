// THROWAWAY preview (not a real route — delete after the Shot O'Clock ring color
// is decided). Renders the shot-window ring in white (current) vs brand Indigo,
// side by side on the real black Shot O'Clock background, so the two can be
// compared in context rather than from description.

import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/ui/ProgressRing';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '@/styles/tokens';

const RING_SIZE = 150;
const SAMPLE_PROGRESS = 0.62;
const TRACK = 'rgba(255,255,255,0.2)';

function RingSample({ color, caption }: { color: string; caption: string }): React.JSX.Element {
  return (
    <View style={styles.sample}>
      <ProgressRing size={RING_SIZE} strokeWidth={8} progress={SAMPLE_PROGRESS} color={color} trackColor={TRACK}>
        <View style={styles.ringContent}>
          <Text style={styles.ringLabel}>SHOT WINDOW</Text>
          <Text style={styles.ringTime}>0:18</Text>
        </View>
      </ProgressRing>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

export default function RingPreviewScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <Text style={styles.title}>SHOT O&apos;CLOCK ring</Text>
      <View style={styles.row}>
        <RingSample color={COLORS.shotRing} caption="WHITE (current)" />
        <RingSample color={COLORS.brandPrimary} caption="INDIGO" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.shotBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 2,
    color: COLORS.shotText,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  sample: {
    alignItems: 'center',
    gap: SPACING.md,
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
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.shotText,
  },
  caption: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.shotText,
    opacity: 0.7,
  },
});
