// Join Party — guest enters a join code and display name to join a party.
//
// Phase 5: the form is live. The code input sanitizes as you type (uppercase,
// allowed alphabet, 6 chars), the name prefills from the stored guest identity
// but stays editable for a per-party alias, and the two age/terms checkboxes
// gate the Join button (per-join reaffirmation — see D016). Join validates,
// calls join_party, and routes to the party's lobby on success (a fresh join or
// a reconnect to an existing row, §3.6); failures surface in the shared
// ErrorBanner. See docs/specs/rpc-contracts.md §3.

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DISPLAY_NAME_MAX_LENGTH, isValidDisplayName } from '@/features/auth/api/displayName';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { getPartyState } from '@/features/party/api/partyState';
import { joinParty } from '@/features/party/api/joinParty';
import { clearLeftPartyId } from '@/features/party/leftParty';
import { routeForPhase } from '@/features/party/reconnectRoute';
import {
  JOIN_CODE_LENGTH,
  isValidJoinCode,
  sanitizeJoinCodeInput,
  validateJoinPartyForm,
} from '@/features/party/joinPartyForm';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function JoinPartyScreen(): React.JSX.Element {
  const { displayName } = useDisplayName();
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [ageChecked, setAgeChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Prefill from the stored guest identity; the field stays editable so a player
  // can use a different name for this party.
  useEffect(() => {
    if (displayName !== null) setName(displayName);
  }, [displayName]);

  const canJoin =
    !submitting &&
    ageChecked &&
    termsChecked &&
    isValidJoinCode(joinCode) &&
    isValidDisplayName(name);

  const handleCodeChange = useCallback((raw: string) => {
    setJoinCode(sanitizeJoinCodeInput(raw));
  }, []);

  const handleJoin = useCallback(async () => {
    if (submitting) return;

    const result = validateJoinPartyForm({ joinCode, displayName: name });
    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    const response = await joinParty(result.params);

    if (response.ok) {
      // Deliberately (re)entering a party clears any intentionally-left marker —
      // including the case of rejoining the very party they left (leftParty).
      void clearLeftPartyId();

      const partyId = response.data.party_session_id;

      // A fresh mid-game joiner (Phase 10B late join) skips the lobby and lands on
      // the live phase's screen. join_party doesn't return the phase, so we read it
      // from a quick snapshot and map it via routeForPhase (timer / shot-oclock).
      // A snapshot failure falls back to the lobby, which forwards by phase anyway.
      if (response.data.is_late_join) {
        const state = await getPartyState(partyId);
        const segment = state.ok ? routeForPhase(state.data.session.current_phase) : 'lobby';
        router.replace(`/party/${partyId}/${segment}`);
        return;
      }

      // replace (not push) so Back from the lobby doesn't return to the join form
      // for a party we're already in. A lobby join and a reconnect (§3.6) land in
      // the lobby — which forwards into the game on its own if it's already live.
      router.replace(`/party/${partyId}/lobby`);
      return;
    }

    setErrorMessage(rpcErrorMessage(response.error_code));
    setSubmitting(false);
  }, [submitting, joinCode, name]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Join Party</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Join Code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={joinCode}
            onChangeText={handleCodeChange}
            placeholder="Enter 6-digit code"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={JOIN_CODE_LENGTH}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.checks}>
          <Checkbox
            checked={ageChecked}
            onToggle={() => setAgeChecked((prev) => !prev)}
            label="I confirm I am of legal drinking age in my jurisdiction"
          />
          <Checkbox
            checked={termsChecked}
            onToggle={() => setTermsChecked((prev) => !prev)}
            label="I agree to play responsibly and follow the rules"
          />
        </View>

        <ErrorBanner message={errorMessage} />

        <Button
          label={submitting ? 'Joining…' : 'Join Party'}
          onPress={handleJoin}
          disabled={!canJoin}
          style={styles.submit}
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
  codeInput: {
    textAlign: 'center',
    letterSpacing: 4,
    fontSize: FONT_SIZE.md,
  },
  checks: {
    gap: SPACING.md,
  },
  submit: {
    marginTop: SPACING.md,
  },
});
