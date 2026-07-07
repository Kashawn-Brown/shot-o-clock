// Single first-launch onboarding screen: display name + the two age/terms
// confirmations together. Renders after auth resolves and before the navigator
// until all three are satisfied. Persistence is unchanged — the root layout wires
// onComplete to useDisplayName.save + useConsent.confirm.

import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DISPLAY_NAME_MAX_LENGTH, isValidDisplayName } from '@/features/auth/api/displayName';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// Full accounts (sign in / register) are post-production — see plan.md Phase 17+.
// The sign-in entry point is hidden until then (kept in place, flag-gated, so it's
// a one-line re-enable rather than a rebuild). plan.md Phase 13.
const SHOW_SIGN_IN = false;

// Hosted legal docs (GitHub Pages). Opened in an in-app browser sheet
// (WebBrowser.openBrowserAsync) rather than switching to an external browser.
const TERMS_URL = 'https://kashawn-brown.github.io/shot-o-clock/terms-of-service.html';
const PRIVACY_URL = 'https://kashawn-brown.github.io/shot-o-clock/privacy-policy.html';

type OnboardingGateProps = {
  onComplete: (name: string) => void;
};

export function OnboardingGate({ onComplete }: OnboardingGateProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [ageChecked, setAgeChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  const canContinue = isValidDisplayName(name) && ageChecked && termsChecked;
  const submit = (): void => {
    if (canContinue) onComplete(name);
  };

  const openTerms = (): void => void WebBrowser.openBrowserAsync(TERMS_URL);
  const openPrivacy = (): void => void WebBrowser.openBrowserAsync(PRIVACY_URL);

  const handleSignIn = (): void => {
    // Placeholder — sign-in / full accounts are post-production (currently hidden
    // behind SHOW_SIGN_IN). Intentionally a no-op until accounts ship.
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Brand mark, no wordmark. Using the transparent-navy PNG so it sits on the
          light canvas; swappable to the SVG master (logo/shot-oclock-mark-primary.svg)
          if we want crisper scaling later. */}
      <View style={styles.logoHeader}>
        <Image
          source={require('@/assets/brand/logo/shot-oclock-mark-primary-transparent-navy.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Shot O'Clock"
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{"Welcome to Shot O'Clock"}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>What should we call you?</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>

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

        <Text style={styles.legal}>
          By continuing, you agree to our{' '}
          <Text style={styles.legalLink} onPress={openTerms}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={openPrivacy}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>

      <View style={styles.footer}>
        <Button label="Continue" onPress={submit} disabled={!canContinue} />
        {/* Sign-in hidden until accounts ship (post-production). See SHOW_SIGN_IN. */}
        {SHOW_SIGN_IN ? (
          <Pressable onPress={handleSignIn} accessibilityRole="button" hitSlop={SPACING.sm}>
            <Text style={styles.signIn}>Already have an account? Sign In</Text>
          </Pressable>
        ) : null}
      </View>
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
  logoHeader: {
    // Absolutely positioned so the mark floats above the layout: moving it (via
    // `top`) doesn't push the centered welcome block down with it. Tune `top`
    // freely to reposition the logo without affecting anything else.
    position: 'absolute',
    top: 128,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  logo: {
    width: 164,
    height: 164,
  },
  body: {
    flex: 1,
    // Top-anchored (not centered) with its own paddingTop so it sits below the
    // absolutely-positioned logo. Tune `paddingTop` to move the welcome block
    // independently of the logo — the two no longer affect each other.
    justifyContent: 'flex-start',
    paddingTop: 280,
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
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
  disclaimer: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  checks: {
    gap: SPACING.md,
  },
  legal: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  legalLink: {
    color: COLORS.brandPrimary,
    textDecorationLine: 'underline',
  },
  footer: {
    gap: SPACING.md,
    alignItems: 'center',
  },
  signIn: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    textDecorationLine: 'underline',
    paddingVertical: SPACING.sm,
  },
});
