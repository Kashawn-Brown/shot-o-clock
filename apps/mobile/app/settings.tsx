// App-level Settings (Surface A, D062) — the global, device-wide settings,
// reached from the Home-header gear. App-global, not party-scoped, so it lives
// at the top level. Per-session overrides for an active party live on the
// separate Surface B route (app/party/[partyId]/settings.tsx).
//
// Phase 15 — Task 2 wires the Display name row (edit + persist device-side via
// useDisplayName). The remaining rows (notifications, sound, party defaults,
// reset) are still inert placeholders, each wired in its own Phase 15 item.

import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { DISPLAY_NAME_MAX_LENGTH, isValidDisplayName } from '@/features/auth/api/displayName';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// One settings row: a title, a short value/description, and a chevron. Tappable
// when given an onPress; inert (a Phase 15 placeholder) otherwise.
function SettingRow({
  title,
  description,
  onPress,
  danger = false,
}: {
  title: string;
  description: string;
  onPress?: () => void;
  danger?: boolean;
}): React.JSX.Element {
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={CHEVRON_SIZE} color={COLORS.textSecondary} />
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
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
  const { displayName, save } = useDisplayName();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

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
            description={displayName ?? 'Not set'}
            onPress={openNameEditor}
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.background,
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
