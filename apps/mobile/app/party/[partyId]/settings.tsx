// Per-session in-game Settings (Surface B, D062/D064) — reached from the timer gear by
// EVERY player, host or not (no role branch). Holds alert + Heads-up overrides scoped
// to THIS party only — they default from the global settings, persist device-side keyed
// by partyId, and are discarded when the party ends; the global defaults (Surface A,
// app/settings.tsx) are never touched. The notification MASTER is global-only (not
// here). The host additionally sees a Party lock row, conditionally rendered.
//
// Role comes from usePartyRole — a one-shot read, NOT useTimerSession: the latter
// drives notification scheduling (whose unmount cancel would kill the timer's batch
// when this pushed screen closes), the advance-phase poll, and realtime subs, none of
// which this screen needs.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { OptionPicker } from '@/components/ui/OptionPicker';
import { PRE_WARNING_OPTIONS } from '@/features/notifications/api/notificationPreferences';
import { SHOT_SOUNDS } from '@/features/notifications/api/shotSounds';
import { useSessionOverride } from '@/features/notifications/useSessionOverride';
import { hostSetPartyLock } from '@/features/party/api/hostSetPartyLock';
import { usePartyRole } from '@/features/party/usePartyRole';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const LEAD_TIME_OPTIONS = PRE_WARNING_OPTIONS.map((minutes) => ({
  label: `${minutes} min`,
  value: minutes,
}));

const SOUND_OPTIONS = SHOT_SOUNDS.map((sound) => ({ label: sound.label, value: sound.id }));

// A row with a right-side on/off Switch (no chevron). For the per-session toggles.
function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
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
  const { status, isHost, isLocked, hostOnly, errorMessage } = usePartyRole(partyId);
  const {
    loaded,
    alertSoundEnabled,
    alertHapticEnabled,
    soundChoice,
    preWarningEnabled,
    leadMinutes,
    setAlertSoundEnabled,
    setAlertHapticEnabled,
    setSoundChoice,
    setPreWarningEnabled,
    setLeadMinutes,
  } = useSessionOverride(partyId);

  // Party lock — seed from the load, then own the value locally (the host is the only
  // one toggling it; this screen has no realtime). null until usePartyRole resolves.
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    if (status === 'ready') setLocked(isLocked);
  }, [status, isLocked]);

  const toggleLock = async (next: boolean): Promise<void> => {
    if (!partyId) return;
    const previous = locked;
    setLocked(next); // optimistic
    const result = await hostSetPartyLock({ partySessionId: partyId, locked: next });
    if (result.ok) {
      setLocked(result.data.is_locked);
      return;
    }
    setLocked(previous); // revert
    Alert.alert("Couldn't update", rpcErrorMessage(result.error_code));
  };

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
          title="Alert"
          caption="For this party only. Plays in the app while you're watching."
        >
          <ToggleRow
            title="Alert sound"
            description="Play a sound when it's Shot O'Clock."
            value={alertSoundEnabled}
            onValueChange={setAlertSoundEnabled}
            disabled={!loaded}
          />
          {alertSoundEnabled ? (
            <View style={styles.subControl}>
              <Text style={styles.subLabel}>Sound</Text>
              <OptionPicker
                options={SOUND_OPTIONS}
                value={soundChoice}
                onChange={setSoundChoice}
                disabled={!loaded}
              />
            </View>
          ) : null}
          <View style={styles.divider} />
          <ToggleRow
            title="Alert haptic"
            description="Vibrate when it's Shot O'Clock."
            value={alertHapticEnabled}
            onValueChange={setAlertHapticEnabled}
            disabled={!loaded}
          />
        </SettingsSection>

        <SettingsSection
          title="Notifications"
          caption="For this party only. Alerts when the app is in the background."
        >
          <ToggleRow
            title="Heads-up"
            description="Get a reminder before the next Shot O'Clock."
            value={preWarningEnabled}
            onValueChange={setPreWarningEnabled}
            disabled={!loaded}
          />
          {preWarningEnabled ? (
            <View style={styles.subControl}>
              <Text style={styles.subLabel}>Lead time</Text>
              <OptionPicker
                options={LEAD_TIME_OPTIONS}
                value={leadMinutes}
                onChange={setLeadMinutes}
                disabled={!loaded}
              />
            </View>
          ) : null}
        </SettingsSection>

        {/* Host-only single-phone mode has no joiners, so the lock is meaningless and
            the whole section is hidden (D040/D050). */}
        {isHost && !hostOnly ? (
          <SettingsSection
            title="Host controls"
            caption="Only you, the host, can see and change this."
          >
            <ToggleRow
              title="Lock party"
              description="Stop any new players from joining, even with the code."
              value={locked ?? false}
              onValueChange={(next) => void toggleLock(next)}
              disabled={locked === null}
            />
          </SettingsSection>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const HEADER_ICON_SIZE = 22; // header back-arrow, matching the other screens

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
  subControl: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  subLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
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
