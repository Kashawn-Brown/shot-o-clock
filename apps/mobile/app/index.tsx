// Home — the launch screen. App title, logo placeholder, the two primary
// entry actions (Create / Join), a Rules link, and the legal-age footer.
//
// Phase 3 placeholder: layout and navigation only, no data or auth. Buttons
// route to hardcoded destinations so the full flow is tappable.

import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function HomeScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.title}>{"Shot O'Clock"}</Text>
        <View style={styles.logo}>
          <Text style={styles.logoText}>Logo</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Create Party" onPress={() => router.push('/create-party')} />
        <Button label="Join Party" variant="outline" onPress={() => router.push('/join-party')} />
        <Text style={styles.rulesLink} onPress={() => router.push('/rules')}>
          Rules / How to Play
        </Text>
      </View>

      <Text style={styles.legal}>Must be of legal drinking age. Drink responsibly.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    gap: SPACING.md,
    alignItems: 'stretch',
  },
  rulesLink: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    textDecorationLine: 'underline',
    paddingVertical: SPACING.sm,
  },
  legal: {
    textAlign: 'center',
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.xl,
  },
});
