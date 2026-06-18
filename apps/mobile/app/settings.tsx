// App-level Settings (Surface A, D062) — the global, device-wide settings,
// reached from the Home-header gear. App-global, not party-scoped, so it lives
// at the top level. Per-session overrides for an active party live on the
// separate Surface B route (app/party/[partyId]/settings.tsx).
//
// Phase 15 scaffold (Task 1): a navigable sectioned shell only. Each row is an
// inert placeholder that gets wired in its own Phase 15 item — display name,
// global notification prefs, global sound options, party-creation defaults, and
// the destructive Reset this device. Nothing here mutates anything yet.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// One inert settings row: a title, a short description of what it will do, and a
// chevron hinting it's tappable once wired. Placeholder for the Phase 15 scaffold.
function SettingRow({
  title,
  description,
  danger = false,
}: {
  title: string;
  description: string;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={CHEVRON_SIZE} color={COLORS.textSecondary} />
    </View>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export default function SettingsScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection title="Profile">
          <SettingRow
            title="Display name"
            description="The name other players see in the lobby and roster."
          />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingRow
            title="Shot O'Clock alert"
            description="Notify me when the shot window opens."
          />
          <View style={styles.divider} />
          <SettingRow
            title="Pre-warning"
            description="A heads-up a few minutes before the next Shot O'Clock."
          />
        </SettingsSection>

        <SettingsSection title="Sound">
          <SettingRow
            title="Shot O'Clock sound"
            description="Choose which sound plays when the window opens."
          />
        </SettingsSection>

        <SettingsSection title="Party defaults">
          <SettingRow
            title="Default party settings"
            description="Pre-fill Create Party with your preferred interval, shot window, grace, and elimination."
          />
        </SettingsSection>

        <SettingsSection title="Device">
          <SettingRow
            title="Reset this device"
            description="Sign out and clear this device, returning to a fresh first launch."
            danger
          />
        </SettingsSection>
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
  rowTitleDanger: {
    color: COLORS.danger,
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
