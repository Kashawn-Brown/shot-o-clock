// OptionPicker — a small inline segmented control: a row of pill options, one
// selected. Used by the settings surfaces for the pre-warning lead time (1/2/5)
// and the sound-vs-vibration alert mode. Kept generic over the value type so both
// numeric and string option sets reuse it.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export interface OptionPickerItem<T> {
  label: string;
  value: T;
}

export function OptionPicker<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  options: OptionPickerItem<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  // Compact = the original smaller pill size/shape (settings pickers). Default is
  // the larger card-style option (the grace / create-party pickers).
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            style={[styles.pill, compact && styles.pillCompact, selected && styles.pillSelected]}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  pill: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  // Compact — the original smaller pill size/shape (settings pickers).
  pillCompact: {
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  pillSelected: {
    // Selected — outlined (Indigo border + soft-Highlight fill, navy label), the
    // shared selection treatment used by the Create Party / host-mode pickers.
    borderWidth: 2,
    borderColor: COLORS.brandPrimary,
    backgroundColor: COLORS.brandHighlightSoft,
    margin: -1, // absorb the extra 1px so selecting doesn't nudge the layout
  },
  pillText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  pillTextSelected: {
    color: COLORS.textPrimary,
  },
});
