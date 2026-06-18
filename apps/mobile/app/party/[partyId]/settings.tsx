// Per-session in-game Settings (Surface B, D062) — reached from the timer gear by
// EVERY player, host or not (no role branch). Holds notification overrides scoped to
// THIS party only — they default from the global settings, persist device-side keyed
// by partyId, and are discarded when the party ends; the global defaults (Surface A,
// app/settings.tsx) are never touched. The host additionally sees a Party lock row,
// conditionally rendered on the same screen.
//
// Role comes from usePartyRole — a one-shot read, NOT useTimerSession: the latter
// drives notification scheduling (whose unmount cancel would kill the timer's batch
// when this pushed screen closes), the advance-phase poll, and realtime subs, none of
// which this screen needs.

import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { OptionPicker } from '@/components/ui/OptionPicker';
import {
  ALERT_MODES,
  PRE_WARNING_OPTIONS,
  type AlertMode,
} from '@/features/notifications/api/notificationPreferences';
import { useSessionOverride } from '@/features/notifications/useSessionOverride';
import { usePartyRole } from '@/features/party/usePartyRole';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const LEAD_TIME_OPTIONS = PRE_WARNING_OPTIONS.map((minutes) => ({
  label: `${minutes} min`,
  value: minutes,
}));

const ALERT_MODE_LABELS: Record<AlertMode, string> = {
  sound: 'Sound',
  vibration: 'Vibration',
};
const ALERT_MODE_OPTIONS = ALERT_MODES.map((mode) => ({
  label: ALERT_MODE_LABELS[mode],
  value: mode,
}));

// One inert settings row: a title, a short description, and a chevron hinting it's
// tappable once wired. Placeholder for the party-lock row (built in a later task).
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

function ControlRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.controlRow}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowDescription}>{description}</Text>
      <View style={styles.controlPicker}>{children}</View>
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
  const { status, isHost, errorMessage } = usePartyRole(partyId);
  const { loaded, preWarningEnabled, leadMinutes, alertMode, setLeadMinutes, setAlertMode } =
    useSessionOverride(partyId);

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
          <ControlRow
            title="Pre-warning lead time"
            description={
              preWarningEnabled
                ? 'How early the heads-up fires before the next Shot O’Clock.'
                : 'Turn pre-warnings on in your global settings to use this.'
            }
          >
            <OptionPicker
              options={LEAD_TIME_OPTIONS}
              value={leadMinutes}
              onChange={setLeadMinutes}
              disabled={!loaded || !preWarningEnabled}
            />
          </ControlRow>
          <View style={styles.divider} />
          <ControlRow
            title="Sound or vibration"
            description="How this game alerts you when the shot window opens."
          >
            <OptionPicker
              options={ALERT_MODE_OPTIONS}
              value={alertMode}
              onChange={setAlertMode}
              disabled={!loaded}
            />
          </ControlRow>
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
  controlRow: {
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  controlPicker: {
    paddingTop: SPACING.xs,
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
