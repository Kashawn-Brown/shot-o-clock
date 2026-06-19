// Party defaults editor (Surface A sub-screen, Phase 15) — the host's preferred Create
// Party settings, reached from the "Default party settings" row on /settings. The same
// controls as Create Party (reusing Stepper + OptionPicker), controlled directly by the
// stored defaults (usePartyCreateDefaults): each change persists immediately. The
// header's "Restore defaults" action resets just these to factory settings, behind a
// confirmation (the destructive-action pattern, scoped to defaults — not a device reset).

import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { OptionPicker } from '@/components/ui/OptionPicker';
import { Stepper } from '@/components/ui/Stepper';
import {
  ELIMINATION_OFF_HINT,
  ELIMINATION_ON_HINT,
  GRACE_MODE_OPTIONS,
  INTERVAL_INCREMENT_MAX_MINUTES,
  INTERVAL_INCREMENT_MIN_MINUTES,
  INTERVAL_INCREMENT_STEP_MINUTES,
  SHOT_WINDOW_MAX_SECONDS,
  SHOT_WINDOW_MIN_SECONDS,
  SHOT_WINDOW_STEP_SECONDS,
  STARTING_INTERVAL_MAX_MINUTES,
  STARTING_INTERVAL_MIN_MINUTES,
  STARTING_INTERVAL_STEP_MINUTES,
} from '@/features/party/createPartyForm';
import { usePartyCreateDefaults } from '@/features/party/usePartyCreateDefaults';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const GRACE_OPTIONS = GRACE_MODE_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value,
}));

export default function PartyDefaultsScreen(): React.JSX.Element {
  const { defaults, save, restore } = usePartyCreateDefaults();

  const confirmRestore = (): void => {
    Alert.alert(
      'Restore party defaults?',
      'This resets your party-creation defaults to the factory settings. Your other settings and current party are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => restore() },
      ],
    );
  };

  if (!defaults) {
    return (
      <SafeAreaView style={[styles.screen, styles.loading]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  const graceHint =
    GRACE_MODE_OPTIONS.find((option) => option.value === defaults.graceMode)?.description ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Party defaults</Text>
        <Pressable
          onPress={confirmRestore}
          accessibilityRole="button"
          accessibilityLabel="Restore defaults"
          hitSlop={8}
        >
          <Text style={styles.restore}>Restore</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>These pre-fill the Create Party screen for every new party.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Starting Interval</Text>
          <Stepper
            value={defaults.startingIntervalMinutes}
            onChange={(value) => save({ ...defaults, startingIntervalMinutes: value })}
            min={STARTING_INTERVAL_MIN_MINUTES}
            max={STARTING_INTERVAL_MAX_MINUTES}
            step={STARTING_INTERVAL_STEP_MINUTES}
            unit="minutes"
            hint="Time until first shot"
            accessibilityLabel="Default starting interval in minutes"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Interval Increase</Text>
          <Stepper
            value={defaults.intervalIncrementMinutes}
            onChange={(value) => save({ ...defaults, intervalIncrementMinutes: value })}
            min={INTERVAL_INCREMENT_MIN_MINUTES}
            max={INTERVAL_INCREMENT_MAX_MINUTES}
            step={INTERVAL_INCREMENT_STEP_MINUTES}
            unit="minutes"
            hint="How much longer each round gets"
            accessibilityLabel="Default interval increase in minutes"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Shot Window Length</Text>
          <Stepper
            value={defaults.shotWindowSeconds}
            onChange={(value) => save({ ...defaults, shotWindowSeconds: value })}
            min={SHOT_WINDOW_MIN_SECONDS}
            max={SHOT_WINDOW_MAX_SECONDS}
            step={SHOT_WINDOW_STEP_SECONDS}
            unit="seconds"
            hint="Time players have to take their shot"
            accessibilityLabel="Default shot window in seconds"
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.label}>Elimination Mode</Text>
            <Text style={styles.hint}>
              {defaults.eliminationEnabled ? ELIMINATION_ON_HINT : ELIMINATION_OFF_HINT}
            </Text>
          </View>
          <Switch
            value={defaults.eliminationEnabled}
            onValueChange={(value) => save({ ...defaults, eliminationEnabled: value })}
          />
        </View>

        {/* Grace mode only matters with elimination on — hide it otherwise, matching
            Create Party. */}
        {defaults.eliminationEnabled ? (
          <View style={styles.field}>
            <Text style={styles.label}>Grace Mode</Text>
            <OptionPicker
              options={GRACE_OPTIONS}
              value={defaults.graceMode}
              onChange={(value) => save({ ...defaults, graceMode: value })}
            />
            <Text style={styles.hint}>{graceHint}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const HEADER_ICON_SIZE = 22; // header back-arrow

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  restore: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.danger,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  intro: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  field: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  toggleText: {
    gap: SPACING.xs,
    flexShrink: 1,
  },
});
