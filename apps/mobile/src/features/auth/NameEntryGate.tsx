// First-launch display-name step. Renders after the age/terms gate and before the
// navigator until the guest sets a name. The name persists locally (useDisplayName)
// and becomes the guest's identity for hosting and joining. No router navigation
// here — it mounts outside the Stack.

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { DISPLAY_NAME_MAX_LENGTH, isValidDisplayName } from '@/features/auth/api/displayName';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type NameEntryGateProps = {
  onSubmit: (name: string) => void;
};

export function NameEntryGate({ onSubmit }: NameEntryGateProps): React.JSX.Element {
  const [name, setName] = useState('');

  const canContinue = isValidDisplayName(name);
  const submit = (): void => {
    if (canContinue) onSubmit(name);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>What should we call you?</Text>
        <Text style={styles.subtitle}>This is the name other players see in the party.</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={COLORS.textSecondary}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </View>

      <Button label="Continue" onPress={submit} disabled={!canContinue} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
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
    marginTop: SPACING.sm,
  },
});
