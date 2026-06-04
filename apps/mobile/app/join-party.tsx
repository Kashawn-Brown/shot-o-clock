// Join Party — guest enters a join code and display name.
//
// Phase 3 placeholder: renders the code field, name field, and the two
// required confirmation checkboxes from the wireframe. No validation, no
// join_party RPC. "Join Party" navigates to a placeholder lobby. Real wiring
// (and the age/terms gate) lands in Phases 4–5.

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const PLACEHOLDER_PARTY_ID = 'test-party';

function Checkbox({ label }: { label: string }): React.JSX.Element {
  return (
    <View style={styles.checkboxRow}>
      <View style={styles.checkbox} />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </View>
  );
}

export default function JoinPartyScreen(): React.JSX.Element {
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
            placeholder="Your name"
            placeholderTextColor={COLORS.textSecondary}
            editable={false}
          />
        </View>

        <View style={styles.checks}>
          <Checkbox label="I confirm I am of legal drinking age in my jurisdiction" />
          <Checkbox label="I agree to play responsibly and follow the rules" />
        </View>

        <Button
          label="Join Party"
          onPress={() => router.push(`/party/${PLACEHOLDER_PARTY_ID}/lobby`)}
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.sm / 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  checkboxLabel: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  submit: {
    marginTop: SPACING.md,
  },
});
