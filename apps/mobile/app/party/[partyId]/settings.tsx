// Per-session in-game Settings (Surface B, D062) — reached from the timer gear
// by EVERY player, host or not (no role branch). Holds notification overrides
// scoped to THIS party only — they default from the global settings, persist
// device-side keyed by partyId, and are discarded when the party ends; the
// global defaults (Surface A, app/settings.tsx) are never touched. The host
// additionally sees a Party lock row, conditionally rendered on the same screen.
//
// isHost is read via useTimerSession(partyId) — the same source the timer uses —
// for consistency, accepting the extra subscription over a lighter role-only read.
//
// Phase 15 scaffold (Task 1): a navigable shell only. Rows are inert placeholders
// wired in later Phase 15 items (per-session overrides; party-lock toggle + RPC).

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useTimerSession } from '@/features/party/useTimerSession';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// One inert settings row: a title, a short description of what it will do, and a
// chevron hinting it's tappable once wired. Placeholder for the Phase 15 scaffold.
function SettingRow({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={CHEVRON_SIZE} color={COLORS.textSecondary} />
    </View>
  );
}

function SettingsSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
    </View>
  );
}

export default function PartySettingsScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { status, me, errorMessage } = useTimerSession(partyId);

  // The party-lock row is host-only (PartyPlayer.permissionRole, §2.4); the
  // per-session notification overrides above it are shown to every player.
  const isHost = me?.permission_role === 'host';

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ErrorBanner message={errorMessage} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Party settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection
          title="Notifications for this party"
          caption="Applies to this party only. Your global settings stay as they are."
        >
          <SettingRow
            title="Pre-warning"
            description="A heads-up a few minutes before the next Shot O'Clock, just for this game."
          />
          <View style={styles.divider} />
          <SettingRow
            title="Sound or vibration"
            description="How this game alerts you when the shot window opens."
          />
        </SettingsSection>

        {isHost ? (
          <SettingsSection
            title="Host controls"
            caption="Only you, the host, can see and change this."
          >
            <SettingRow
              title="Lock party"
              description="Stop new players from joining, even with the join code."
            />
          </SettingsSection>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const HEADER_ICON_SIZE = 22; // header back-arrow, matching the other screens
const CHEVRON_SIZE = 20; // per-row tappable indicator

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.xs,
  },
  sectionCaption: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.xs,
    lineHeight: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  rowText: {
    flex: 1,
    gap: SPACING.xs,
  },
  rowTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  rowDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
});
