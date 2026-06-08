// Stepper — a compact −/value/+ numeric control. The minus and plus buttons step
// by a fixed amount; the value in the middle is also tappable, opening a numeric
// keyboard for direct entry that clamps to [min, max] on blur/submit. An optional
// unit label sits after the + button, so a field reads: [−  5  +] minutes.
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
  accessibilityLabel?: string;
};

export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  unit,
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
    <View style={styles.container}>
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

      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Content-sized (not full width) and centered on screen.
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  button: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
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
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  value: {
    minWidth: 100,
    textAlign: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  unit: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
});
