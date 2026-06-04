// Join Party — guest enters a join code and display name.
//
// Phase 4: the two age/terms checkboxes are now functional and gate the Join
// button (Figma shows them per-join; the host is covered by the first-launch
// gate — see D016). The code/name inputs and the join_party RPC are still
// Phase 5; "Join Party" navigates to a placeholder lobby for now.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DISPLAY_NAME_MAX_LENGTH, isValidDisplayName } from '@/features/auth/api/displayName';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const PLACEHOLDER_PARTY_ID = 'test-party';

export default function JoinPartyScreen(): React.JSX.Element {
  const { displayName } = useDisplayName();
  const [name, setName] = useState('');
  const [ageChecked, setAgeChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  // Prefill from the stored guest identity; the field stays editable so a player
  // can use a different name for this party.
  useEffect(() => {
    if (displayName !== null) setName(displayName);
  }, [displayName]);

  const canJoin = ageChecked && termsChecked && isValidDisplayName(name);

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
            placeholder="Enter 6-digit code"
            placeholderTextColor={COLORS.textSecondary}
            editable={false}
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

        <Button
          label="Join Party"
          onPress={() => router.push(`/party/${PLACEHOLDER_PARTY_ID}/lobby`)}
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
