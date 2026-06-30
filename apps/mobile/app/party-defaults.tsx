// Party defaults editor (Surface A sub-screen, Phase 15) — the host's preferred Create
// Party settings, reached from the "Default party settings" row on /settings. The same
// controls as Create Party (reusing Stepper + OptionPicker). Edit-local / persist-on-
// Save: the controls edit a local DRAFT seeded from the saved defaults; nothing hits
// storage until the footer Save (disabled until the draft differs). The header "Restore"
// action (confirmation unchanged) resets the DRAFT to factory locally — also not
// persisted until Save. Backing out without Save discards the edits.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { OptionPicker } from '@/components/ui/OptionPicker';
import { Stepper } from '@/components/ui/Stepper';
import {
  ELIMINATION_OFF_HINT,
  ELIMINATION_ON_HINT,
  GRACE_MODE_OPTIONS,
  GRACE_PICKER_OPTIONS,
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
import {
  FACTORY_PARTY_CREATE_DEFAULTS,
  type PartyCreateDefaults,
} from '@/features/party/partyDefaults';
import { usePartyCreateDefaults } from '@/features/party/usePartyCreateDefaults';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// Shallow compare the five fields, for the Save "dirty" gate.
function defaultsEqual(a: PartyCreateDefaults, b: PartyCreateDefaults): boolean {
  return (
    a.startingIntervalMinutes === b.startingIntervalMinutes &&
    a.intervalIncrementMinutes === b.intervalIncrementMinutes &&
    a.shotWindowSeconds === b.shotWindowSeconds &&
    a.eliminationEnabled === b.eliminationEnabled &&
    a.graceMode === b.graceMode
  );
}

export default function PartyDefaultsScreen(): React.JSX.Element {
  const { defaults, save } = usePartyCreateDefaults();

  // Local draft, seeded once from the saved defaults. Edits stay here until Save.
  const [draft, setDraft] = useState<PartyCreateDefaults | null>(null);
  useEffect(() => {
    if (defaults && !draft) setDraft(defaults);
  }, [defaults, draft]);

  // Restore resets the DRAFT to factory locally — no confirmation needed: nothing
  // persists until Save (the draft preview + dirty-gated Save are the safety net).
  const restoreDraft = (): void => setDraft(FACTORY_PARTY_CREATE_DEFAULTS);

  if (!defaults || !draft) {
    return (
      <SafeAreaView style={[styles.screen, styles.loading]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  const dirty = !defaultsEqual(draft, defaults);
  const graceHint =
    GRACE_MODE_OPTIONS.find((option) => option.value === draft.graceMode)?.description ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Party defaults"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={restoreDraft}
            accessibilityRole="button"
            accessibilityLabel="Restore defaults"
            hitSlop={8}
          >
            <Text style={styles.restore}>Restore</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Set your pre-filled values for everytime you create
           a new party.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Starting Interval</Text>
          <Stepper
            value={draft.startingIntervalMinutes}
            onChange={(value) => setDraft({ ...draft, startingIntervalMinutes: value })}
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
            value={draft.intervalIncrementMinutes}
            onChange={(value) => setDraft({ ...draft, intervalIncrementMinutes: value })}
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
            value={draft.shotWindowSeconds}
            onChange={(value) => setDraft({ ...draft, shotWindowSeconds: value })}
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
              {draft.eliminationEnabled ? ELIMINATION_ON_HINT : ELIMINATION_OFF_HINT}
            </Text>
          </View>
          <Switch
            value={draft.eliminationEnabled}
            onValueChange={(value) => setDraft({ ...draft, eliminationEnabled: value })}
            trackColor={{ false: COLORS.border, true: COLORS.brandPrimary }}
            thumbColor={COLORS.surfaceRaised}
          />
        </View>

        {/* Grace mode only matters with elimination on — hide it otherwise, matching
            Create Party. */}
        {draft.eliminationEnabled ? (
          <View style={styles.field}>
            <Text style={styles.label}>Grace Mode</Text>
            <OptionPicker
              options={GRACE_PICKER_OPTIONS}
              value={draft.graceMode}
              onChange={(value) => setDraft({ ...draft, graceMode: value })}
            />
            <Text style={styles.hint}>{graceHint}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Save"
          onPress={() => {
            save(draft);
            router.back();
          }}
          disabled={!dirty}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
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
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
