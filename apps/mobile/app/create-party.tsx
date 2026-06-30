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
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { OptionPicker } from '@/components/ui/OptionPicker';
import { Stepper } from '@/components/ui/Stepper';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { createParty } from '@/features/party/api/createParty';
import { startGame } from '@/features/party/api/startGame';
import { HostModePicker } from '@/features/party/HostModePicker';
import { clearLeftPartyId } from '@/features/party/leftParty';
import { usePartyCreateDefaults } from '@/features/party/usePartyCreateDefaults';
import type { PartyCreateDefaults } from '@/features/party/partyDefaults';
import {
  DEFAULT_HOST_ONLY,
  ELIMINATION_OFF_HINT,
  ELIMINATION_ON_HINT,
  formatDefaultPartyName,
  GRACE_MODE_OPTIONS,
  GRACE_PICKER_OPTIONS,
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

// Gate: load the host's saved party-creation defaults, then mount the form seeded
// from them. The form initializes its state from props (synchronously available once
// loaded), so the defaults pre-fill cleanly without a back-filling effect.
export default function CreatePartyScreen(): React.JSX.Element {
  const { defaults } = usePartyCreateDefaults();

  if (!defaults) {
    return (
      <SafeAreaView style={[styles.screen, styles.loading]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  return <CreatePartyForm initialDefaults={defaults} />;
}

function CreatePartyForm({
  initialDefaults,
}: {
  initialDefaults: PartyCreateDefaults;
}): React.JSX.Element {
  const { displayName } = useDisplayName();

  // Held silently as the fallback name. The visible field stays empty (showing
  // its placeholder) to nudge the host to enter their own, but a submit with an
  // empty field uses this default rather than failing — so we never submit empty.
  const defaultPartyName = useMemo(() => formatDefaultPartyName(new Date()), []);
  const [partyName, setPartyName] = useState('');
  // Interval/shot-window/elimination/grace seed from the host's saved defaults
  // (factory defaults when none saved). host-only + name are not saved defaults.
  const [startingIntervalMinutes, setStartingIntervalMinutes] = useState(
    initialDefaults.startingIntervalMinutes,
  );
  const [intervalIncrementMinutes, setIntervalIncrementMinutes] = useState(
    initialDefaults.intervalIncrementMinutes,
  );
  const [shotWindowSeconds, setShotWindowSeconds] = useState(initialDefaults.shotWindowSeconds);
  const [eliminationEnabled, setEliminationEnabled] = useState(initialDefaults.eliminationEnabled);
  const [graceMode, setGraceMode] = useState<GraceMode>(initialDefaults.graceMode);
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
      // Single-phone parties force elimination off: the host is the only roster
      // row and never taps Done, so under elimination they'd eliminate themselves
      // and halt the solo loop. Off keeps timer → Shot O'Clock → timer running
      // until End Party (D040, D050). The validator collapses graceMode to
      // 'disabled' when elimination is off, so the held graceMode value is moot.
      eliminationEnabled: hostOnly ? false : eliminationEnabled,
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
      <ScreenHeader title="Create Party" onBack={() => router.back()} />

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

        {/* Mode picker anchored at the top, above everything — fixes the old
            toggle's misclick bug (its position shifted with Grace Mode visibility).
            Host-only hides Elimination/Grace below (D040/D050). */}
        <View style={styles.field}>
          <Text style={styles.label}>Game Mode</Text>    
          <HostModePicker hostOnly={hostOnly} onChange={setHostOnly} />
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
            hint="Starting time until first shot"
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
            unit="minute(s)"
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

        {/* Elimination + Grace are meaningless in single-phone mode — there are no
            tracked players to eliminate, and forcing elimination off is what keeps
            the solo loop running (D040, D050). Hide both when host-only is on. */}
        {!hostOnly && (
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.label}>Elimination</Text>
              <Text style={styles.hint}>
                {eliminationEnabled ? ELIMINATION_ON_HINT : ELIMINATION_OFF_HINT}
              </Text>
            </View>
            <Switch
              value={eliminationEnabled}
              onValueChange={setEliminationEnabled}
              trackColor={{ false: COLORS.border, true: COLORS.brandPrimary }}
              thumbColor={COLORS.surfaceRaised}
            />
          </View>
        )}

        {/* Grace mode only matters with elimination on — hide it otherwise
            (plan.md Phase 5), and always in single-phone mode. */}
        {!hostOnly && eliminationEnabled && (
          <View style={styles.field}>
            <Text style={styles.label}>Grace Mode</Text>
            <OptionPicker
              options={GRACE_PICKER_OPTIONS}
              value={graceMode}
              onChange={setGraceMode}
            />
            <Text style={styles.hint}>{graceHint}</Text>
          </View>
        )}

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
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
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
  submit: {
    marginTop: SPACING.md,
  },
});
