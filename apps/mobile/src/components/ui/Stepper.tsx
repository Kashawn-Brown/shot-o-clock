// Stepper — a compact −/value/+ numeric control. The minus and plus buttons step
// by a fixed amount; the value in the middle is also tappable, opening a numeric
// keyboard for direct entry that clamps to [min, max] on blur/submit.
//
// Layout: the box spans the full width of its container (matching the other full-width
// fields), sized to the same height. The − and + buttons are inset chips pinned to the
// left and right edges; the value and its unit form one centered block — "5 minutes",
// the unit smaller and secondary-colored, visually attached to the number:
// [ (−)      5 minutes      (+) ]. The hint sits below, left-aligned to the box edge.
//
// Direct entry can land on any in-range integer (not just step multiples) — the
// step only governs the buttons. Used by the Create Party screen. Colors/spacing
// come from tokens.ts.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  accessibilityLabel?: string;
};

export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  hint,
  accessibilityLabel,
}: StepperProps): React.JSX.Element {
  // Local draft for the editable field; resynced whenever `value` changes from
  // the buttons or a parent update.
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const canDecrement = value - step >= min;
  const canIncrement = value + step <= max;

  const decrement = (): void => {
    if (canDecrement) onChange(value - step);
  };

  const increment = (): void => {
    if (canIncrement) onChange(value + step);
  };

  // Parse the draft on blur/submit: revert to the current value on invalid
  // input, otherwise clamp into [min, max].
  const commit = (): void => {
    const parsed = parseInt(text, 10);
    const next = Number.isNaN(parsed) ? value : Math.min(max, Math.max(min, parsed));
    setText(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <View>
      <View
        style={styles.box}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ now: value, min, max }}
      >
        <Pressable
          onPress={decrement}
          disabled={!canDecrement}
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            !canDecrement && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.symbol}>−</Text>
        </Pressable>

        {/* Value + unit centered together, filling the space between the buttons. */}
        <View style={styles.valueGroup}>
          <TextInput
            style={styles.value}
            value={text}
            onChangeText={setText}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={String(max).length}
            accessibilityLabel={accessibilityLabel}
          />
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </View>

        <Pressable
          onPress={increment}
          disabled={!canIncrement}
          accessibilityRole="button"
          accessibilityLabel="Increase"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            !canIncrement && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.symbol}>+</Text>
        </Pressable>
      </View>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    // − chip | centered value+unit | + chip, full width.
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    // Small inset so the chips don't touch the rounded corners; the vertical inset
    // sizes the box to about the height of the Party Name input.
    padding: SPACING.sm,
  },
  // The value + unit as one tight block, centered by the box's space-between.
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Inset tap target: a small rounded chip a touch darker than the box surface.
  button: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  pressed: {
    opacity: 0.6,
  },
  symbol: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  value: {
    minWidth: 40,
    textAlign: 'right',
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  // Smaller than the value and in the secondary color, sitting right beside the
  // number so "5 minutes" reads as one element.
  unit: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  hint: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
});
