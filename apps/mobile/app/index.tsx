// Home — the launch screen. App title, logo placeholder, the two primary
// entry actions (Create / Join), a Rules link, and the legal-age footer.
//
// Phase 3 placeholder: layout and navigation only, no data or auth. Buttons
// route to hardcoded destinations so the full flow is tappable.

import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { useActiveParty } from '@/features/party/useActiveParty';
import { routeForPhase } from '@/features/party/reconnectRoute';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function HomeScreen(): React.JSX.Element {
  // Reconnect: if the guest is already in an in-progress party (e.g. after a
  // force-close), route them straight back to its current screen instead of home.
  const { status, activeParty } = useActiveParty();

  useEffect(() => {
    if (!activeParty) return;
    const { partyId, phase } = activeParty;
    switch (routeForPhase(phase)) {
      case 'timer':
        router.replace(`/party/${partyId}/timer`);
        break;
      case 'shot-oclock':
        router.replace(`/party/${partyId}/shot-oclock`);
        break;
      case 'results':
        router.replace(`/party/${partyId}/results`);
        break;
      case 'summary':
        router.replace(`/party/${partyId}/summary`);
        break;
      case 'lobby':
      default:
        router.replace(`/party/${partyId}/lobby`);
        break;
    }
  }, [activeParty]);

  // Keep the spinner up while checking, and while a redirect to the active party
  // is pending, so the home actions never flash before navigation.
  if (status === 'checking' || activeParty !== null) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Top-right settings gear — same pattern as the timer screen. Tappable but
          a no-op for now; wired to the Settings route in Phase 15. */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {}}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
      </View>

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

const HEADER_ICON_SIZE = 22; // settings gear, matching the timer screen
const HOME_TITLE_FONT_SIZE = 44; // launch hero title — larger than FONT_SIZE.lg

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: SPACING.sm,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  title: {
    fontSize: HOME_TITLE_FONT_SIZE,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
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
