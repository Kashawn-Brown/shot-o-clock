// SoundPicker — the alert-sound selector used on both settings surfaces. Compact by
// default: a single pill showing the current sound (styled like the OptionPicker
// selected pill). Tapping it opens a bottom-sheet with all sounds as rows — each row
// selects on tap and has a ▶ button that previews the sound (expo-audio) without
// changing the selection. The sheet edits a local DRAFT; only Save commits it via
// onChange, so previewing and browsing never touch the saved preference.

import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  SHOT_SOUNDS,
  shotSoundAsset,
  type ShotSoundId,
} from '@/features/notifications/api/shotSounds';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type SoundPickerProps = {
  value: ShotSoundId;
  onChange: (id: ShotSoundId) => void;
  disabled?: boolean;
};

export function SoundPicker({ value, onChange, disabled = false }: SoundPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ShotSoundId>(value);

  // One reusable preview player; its source is swapped per ▶ tap. Seeded with a stable
  // sound so the source only ever changes via replace(), never via hook re-creation.
  const preview = useAudioPlayer(SHOT_SOUNDS[0].asset);

  const currentLabel = SHOT_SOUNDS.find((sound) => sound.id === value)?.label ?? SHOT_SOUNDS[0].label;

  const openSheet = (): void => {
    setDraft(value); // reset the draft to the saved value on every open
    setOpen(true);
  };

  const dismiss = (): void => {
    preview.pause();
    setOpen(false);
  };

  const save = (): void => {
    onChange(draft);
    dismiss();
  };

  const playPreview = (id: ShotSoundId): void => {
    // replace() reloads from the start, so re-tapping the same sound replays it.
    preview.replace(shotSoundAsset(id));
    preview.play();
  };

  return (
    <>
      <Pressable
        onPress={openSheet}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Alert sound: ${currentLabel}. Tap to change.`}
        style={[styles.trigger, disabled && styles.disabled]}
      >
        <Text style={styles.triggerLabel}>{currentLabel}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.brandPrimary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={dismiss}>
        {/* Tap the dim backdrop to dismiss without saving; taps inside the sheet don't. */}
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button">
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.title}>Alert sound</Text>
              <Pressable onPress={save} hitSlop={8} accessibilityRole="button">
                <Text style={styles.save}>Save</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
              {SHOT_SOUNDS.map((sound) => {
                const selected = sound.id === draft;
                return (
                  <View key={sound.id} style={[styles.row, selected && styles.rowSelected]}>
                    <Pressable
                      onPress={() => setDraft(sound.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={styles.rowSelect}
                    >
                      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                        {sound.label}
                      </Text>
                    </Pressable>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={COLORS.brandPrimary} />
                    ) : null}
                    <Pressable
                      onPress={() => playPreview(sound.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Preview ${sound.label}`}
                      style={styles.play}
                    >
                      <Ionicons name="play" size={18} color={COLORS.brandPrimary} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger — mirrors the OptionPicker compact selected pill, plus a chevron.
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: COLORS.brandPrimary,
    backgroundColor: COLORS.brandHighlightSoft,
  },
  triggerLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  disabled: {
    opacity: 0.4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: SPACING.xl,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  cancel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  save: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.brandPrimary,
  },
  listContent: {
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  rowSelected: {
    backgroundColor: COLORS.brandHighlightSoft,
  },
  rowSelect: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  rowLabelSelected: {
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.brandPrimary,
  },
  play: {
    padding: SPACING.xs,
  },
});
