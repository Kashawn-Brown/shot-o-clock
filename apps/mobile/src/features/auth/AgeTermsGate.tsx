// First-launch age + terms gate. Renders before the navigator (app/_layout.tsx)
// until the guest confirms legal drinking age and accepts the responsible-use
// terms. Both are required; the confirmations persist locally (useConsent), so
// this is shown once. No router navigation here — it mounts outside the Stack.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '@/styles/tokens';

type AgeTermsGateProps = {
  onConfirm: () => void;
};

export function AgeTermsGate({ onConfirm }: AgeTermsGateProps): React.JSX.Element {
  const [ageChecked, setAgeChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  const canContinue = ageChecked && termsChecked;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.disclaimer}>
          {
            "Shot O'Clock is a social drinking game for adults of legal drinking age. Play responsibly, know your limits, never pressure anyone to drink, and never drink and drive. You are responsible for your own choices while using this app."
          }
        </Text>

        <View style={styles.checks}>
          <Checkbox
            checked={ageChecked}
            onToggle={() => setAgeChecked((prev) => !prev)}
            label="I confirm I am of legal drinking age in my country or region."
          />
          <Checkbox
            checked={termsChecked}
            onToggle={() => setTermsChecked((prev) => !prev)}
            label="I accept the terms and agree to drink responsibly."
          />
        </View>
      </View>

      <Button label="Continue" onPress={onConfirm} disabled={!canContinue} />
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
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  disclaimer: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  checks: {
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
});
