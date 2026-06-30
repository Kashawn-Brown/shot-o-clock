// App-level Settings (Surface A, D062/D064) — the global, device-wide settings,
// reached from the Home-header gear. App-global, not party-scoped, so it lives at the
// top level. Per-session overrides for an active party live on the separate Surface B
// route (app/party/[partyId]/settings.tsx).
//
// Two alert concepts (D064): the foreground ALERT (in-app sound + haptic + sound file)
// and the backgrounded NOTIFICATION (OS-delivered master + Heads-up). Party-creation
// defaults remain an inert placeholder until their Phase 15 task.

import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { OptionPicker } from '@/components/ui/OptionPicker';
import { SettingRow } from '@/components/ui/SettingRow';
import { SettingsSection } from '@/components/ui/SettingsSection';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { DISPLAY_NAME_MAX_LENGTH, isValidDisplayName } from '@/features/auth/api/displayName';
import type { GlobalAlertPrefs } from '@/features/notifications/api/alertPreferences';
import { SHOT_SOUNDS } from '@/features/notifications/api/shotSounds';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { useGlobalAlertPrefs } from '@/features/notifications/useGlobalAlertPrefs';
import { useReset } from '@/features/auth/ResetProvider';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// The available in-app Alert sounds, as picker options.
const SOUND_OPTIONS = SHOT_SOUNDS.map((sound) => ({ label: sound.label, value: sound.id }));

export default function SettingsScreen(): React.JSX.Element {
  const { displayName, save } = useDisplayName();
  const {
    prefs: alertPrefs,
    setSoundEnabled,
    setHapticEnabled,
    setSoundChoice,
  } = useGlobalAlertPrefs();
  const { reset } = useReset();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  // Destructive: a single confirmation, then resetDevice() wipes all device-side
  // state and the identity tree remounts into onboarding (ResetProvider / D018).
  const confirmReset = (): void => {
    Alert.alert(
      'Reset this device?',
      "This signs you out and erases everything saved on this device — your name, your preferences, and your link to any current party. You'll start fresh, like a new install. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => void reset() },
      ],
    );
  };

  const openNameEditor = (): void => {
    setDraftName(displayName ?? '');
    setEditingName(true);
  };

  const saveName = async (): Promise<void> => {
    if (!isValidDisplayName(draftName) || saving) return;
    setSaving(true);
    await save(draftName);
    setSaving(false);
    setEditingName(false);
  };

  // Show sensible defaults instantly; the toggles are disabled until storage loads
  // (near-instant) so a tap can't race the initial read and clobber a stored value.
  const alertLoaded = alertPrefs !== null;
  const alert: GlobalAlertPrefs = alertPrefs ?? {
    soundEnabled: false,
    hapticEnabled: true,
    soundChoice: 'classic',
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Settings" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection title="Profile">
          <SettingRow
            title="Display name"
            description={displayName ?? 'Not set'}
            onPress={openNameEditor}
          />
        </SettingsSection>

        <SettingsSection title="Alert" caption="Plays in the app while you're watching.">
          <ToggleRow
            title="Alert sound"
            description="Play a sound when it's Shot O'Clock."
            value={alert.soundEnabled}
            onValueChange={setSoundEnabled}
            disabled={!alertLoaded}
          />
          {alert.soundEnabled ? (
            <View style={styles.subControl}>
              <Text style={styles.subLabel}>Sound</Text>
              <OptionPicker
                options={SOUND_OPTIONS}
                value={alert.soundChoice}
                onChange={setSoundChoice}
                disabled={!alertLoaded}
                compact
              />
            </View>
          ) : null}
          <View style={styles.divider} />
          <ToggleRow
            title="Alert haptic"
            description="Vibrate when it's Shot O'Clock."
            value={alert.hapticEnabled}
            onValueChange={setHapticEnabled}
            disabled={!alertLoaded}
          />
        </SettingsSection>

        <SettingsSection title="Party defaults">
          <SettingRow
            title="Default party settings"
            description="Your default Create Party settings."
            onPress={() => router.push('/party-defaults')}
          />
        </SettingsSection>

        <SettingsSection title="Device">
          <SettingRow
            title="Reset this device"
            description="Clear this device and erase all saved app info."
            onPress={confirmReset}
            danger
          />
        </SettingsSection>
      </ScrollView>

      {/* Display name editor — a small centered modal reusing the same validation
          and persistence as first-launch onboarding (useDisplayName + the 1–40
          bound). Save is disabled until the trimmed name is valid. */}
      <Modal
        visible={editingName}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingName(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditingName(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Display name</Text>
            <Text style={styles.modalSubtitle}>
              The name other players see in the lobby and roster.
            </Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Your name"
              placeholderTextColor={COLORS.textSecondary}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              autoCapitalize="words"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setEditingName(false)}
                style={styles.modalButton}
              />
              <Button
                label={saving ? 'Saving…' : 'Save'}
                onPress={saveName}
                disabled={!isValidDisplayName(draftName) || saving}
                style={styles.modalButton}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
  },
});
