// Create Party — host configures and creates a new party.
//
// Phase 5: the form is live. It collects the party name, the minute-based
// interval fields, the shot window, the elimination toggle, and (only when
// elimination is on) the grace mode, validates them against the create_party
// bounds, and calls the RPC. On success it routes to the new party's lobby; on
// failure it surfaces the error in the shared ErrorBanner. The host's name comes
// from the stored guest identity (this screen has no name field — see D017).
//
// Validation + minute→second conversion live in createPartyForm.ts so they can
// be unit-tested without the UI. See docs/specs/rpc-contracts.md §2.

import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Stepper } from '@/components/ui/Stepper';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { createParty } from '@/features/party/api/createParty';
import { startGame } from '@/features/party/api/startGame';
import { clearLeftPartyId } from '@/features/party/leftParty';
import {
  DEFAULT_ELIMINATION_ENABLED,
  DEFAULT_GRACE_MODE,
  DEFAULT_HOST_ONLY,
  DEFAULT_INTERVAL_INCREMENT_MINUTES,
  DEFAULT_SHOT_WINDOW_SECONDS,
  DEFAULT_STARTING_INTERVAL_MINUTES,
  ELIMINATION_OFF_HINT,
  ELIMINATION_ON_HINT,
  formatDefaultPartyName,
  GRACE_MODE_OPTIONS,
  HOST_ONLY_OFF_HINT,
  HOST_ONLY_ON_HINT,
  INTERVAL_INCREMENT_MAX_MINUTES,
  INTERVAL_INCREMENT_MIN_MINUTES,
  INTERVAL_INCREMENT_STEP_MINUTES,
  PARTY_NAME_MAX_LENGTH,
  SHOT_WINDOW_MAX_SECONDS,
  SHOT_WINDOW_MIN_SECONDS,
  SHOT_WINDOW_STEP_SECONDS,
  STARTING_INTERVAL_MAX_MINUTES,
  STARTING_INTERVAL_MIN_MINUTES,
  STARTING_INTERVAL_STEP_MINUTES,
  validateCreatePartyForm,
  type GraceMode,
} from '@/features/party/createPartyForm';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function CreatePartyScreen(): React.JSX.Element {
  const { displayName } = useDisplayName();

  // Held silently as the fallback name. The visible field stays empty (showing
  // its placeholder) to nudge the host to enter their own, but a submit with an
  // empty field uses this default rather than failing — so we never submit empty.
  const defaultPartyName = useMemo(() => formatDefaultPartyName(new Date()), []);
  const [partyName, setPartyName] = useState('');
  const [startingIntervalMinutes, setStartingIntervalMinutes] = useState(
    DEFAULT_STARTING_INTERVAL_MINUTES,
  );
  const [intervalIncrementMinutes, setIntervalIncrementMinutes] = useState(
    DEFAULT_INTERVAL_INCREMENT_MINUTES,
  );
  const [shotWindowSeconds, setShotWindowSeconds] = useState(DEFAULT_SHOT_WINDOW_SECONDS);
  const [eliminationEnabled, setEliminationEnabled] = useState(DEFAULT_ELIMINATION_ENABLED);
  const [graceMode, setGraceMode] = useState<GraceMode>(DEFAULT_GRACE_MODE);
  const [hostOnly, setHostOnly] = useState(DEFAULT_HOST_ONLY);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (submitting) return;

    // Fall back to the silent default when the field is left empty (or blank),
    // so the submitted name is never empty.
    const effectivePartyName = partyName.trim().length > 0 ? partyName : defaultPartyName;

    const result = validateCreatePartyForm({
      partyName: effectivePartyName,
      // Steppers hold numbers; the validator parses strings and owns the
      // minute→second conversion + param assembly, so stringify here.
      startingIntervalMinutes: String(startingIntervalMinutes),
      intervalIncrementMinutes: String(intervalIncrementMinutes),
      shotWindowSeconds: String(shotWindowSeconds),
      eliminationEnabled,
      graceMode,
      hostDisplayName: displayName,
      hostOnly,
    });

    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    const response = await createParty(result.params);

    if (!response.ok) {
      setErrorMessage(rpcErrorMessage(response.error_code));
      setSubmitting(false);
      return;
    }

    const partySessionId = response.data.party_session_id;
    // Entering a fresh party clears any intentionally-left marker (leftParty).
    void clearLeftPartyId();

    // Multi-device: land in the lobby so others can join by code, then the host
    // taps Start. Single-phone (host_only, D040): there are no other devices to
    // wait for, so skip the lobby — start round 1 here and drop straight into
    // the timer. start_game is idempotent (§5.6); if it fails (rare, right after
    // a successful create) fall back to the lobby, the one valid screen for a
    // party still in the lobby phase, where Start can be retried.
    if (hostOnly) {
      const started = await startGame({ partySessionId });
      if (started.ok) {
        router.replace(`/party/${partySessionId}/timer`);
        return;
      }
      router.replace(`/party/${partySessionId}/lobby`);
      return;
    }

    // replace (not push) so Back from the lobby doesn't return to a stale
    // create form for a party that now exists.
    router.replace(`/party/${partySessionId}/lobby`);
  }, [
    submitting,
    partyName,
    defaultPartyName,
    startingIntervalMinutes,
    intervalIncrementMinutes,
    shotWindowSeconds,
    eliminationEnabled,
    graceMode,
    displayName,
    hostOnly,
  ]);

  const graceHint =
    GRACE_MODE_OPTIONS.find((option) => option.value === graceMode)?.description ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Create Party</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Party Name</Text>
          <TextInput
            style={styles.input}
            value={partyName}
            onChangeText={setPartyName}
            placeholder="e.g., Friday Night Shots"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={PARTY_NAME_MAX_LENGTH}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Starting Interval</Text>
          <Stepper
            value={startingIntervalMinutes}
            onChange={setStartingIntervalMinutes}
            min={STARTING_INTERVAL_MIN_MINUTES}
            max={STARTING_INTERVAL_MAX_MINUTES}
            step={STARTING_INTERVAL_STEP_MINUTES}
            unit="minutes"
            hint="Time until first shot"
            accessibilityLabel="Starting interval in minutes"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Interval Increase</Text>
          <Stepper
            value={intervalIncrementMinutes}
            onChange={setIntervalIncrementMinutes}
            min={INTERVAL_INCREMENT_MIN_MINUTES}
            max={INTERVAL_INCREMENT_MAX_MINUTES}
            step={INTERVAL_INCREMENT_STEP_MINUTES}
            unit="minutes"
            hint="How much longer each round gets"
            accessibilityLabel="Interval increase in minutes"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Shot Window Length</Text>
          <Stepper
            value={shotWindowSeconds}
            onChange={setShotWindowSeconds}
            min={SHOT_WINDOW_MIN_SECONDS}
            max={SHOT_WINDOW_MAX_SECONDS}
            step={SHOT_WINDOW_STEP_SECONDS}
            unit="seconds"
            hint="Time players have to take their shot"
            accessibilityLabel="Shot window in seconds"
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.label}>Elimination Mode</Text>
            <Text style={styles.hint}>
              {eliminationEnabled ? ELIMINATION_ON_HINT : ELIMINATION_OFF_HINT}
            </Text>
          </View>
          <Switch value={eliminationEnabled} onValueChange={setEliminationEnabled} />
        </View>

        {/* Grace mode only matters with elimination on — hide it otherwise
            (plan.md Phase 5). */}
        {eliminationEnabled && (
          <View style={styles.field}>
            <Text style={styles.label}>Grace Mode</Text>
            <View style={styles.segment}>
              {GRACE_MODE_OPTIONS.map((option) => {
                const active = graceMode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setGraceMode(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                  >
                    <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>{graceHint}</Text>
          </View>
        )}

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.label}>Single-Phone Mode</Text>
            <Text style={styles.hint}>{hostOnly ? HOST_ONLY_ON_HINT : HOST_ONLY_OFF_HINT}</Text>
          </View>
          <Switch value={hostOnly} onValueChange={setHostOnly} />
        </View>

        <ErrorBanner message={errorMessage} />

        <Button
          label={submitting ? 'Creating…' : 'Create Party'}
          onPress={handleCreate}
          disabled={submitting}
          style={styles.submit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  back: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  field: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
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
  segment: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  segmentItemActive: {
    backgroundColor: COLORS.buttonFilled,
    borderColor: COLORS.buttonFilled,
  },
  segmentLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  segmentLabelActive: {
    color: COLORS.buttonFilledText,
    fontWeight: FONT_WEIGHT.medium,
  },
  submit: {
    marginTop: SPACING.md,
  },
});
