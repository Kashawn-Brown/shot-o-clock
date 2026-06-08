// Stepper — a bounded −/+ numeric control: a minus button, the current value in
// the middle, and a plus button. The value is display-only (no text entry), so
// the result is always a valid in-range integer by construction. Used by the
// Create Party screen for the interval and shot-window settings. The minus
// button disables at `min`, the plus button at `max`, and steps clamp to the
// bounds. Colors/spacing come from tokens.ts.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  accessibilityLabel?: string;
};

export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  accessibilityLabel,
}: StepperProps): React.JSX.Element {
  const canDecrement = value - step >= min;
  const canIncrement = value + step <= max;

  const decrement = (): void => {
    if (canDecrement) onChange(value - step);
  };

  const increment = (): void => {
    if (canIncrement) onChange(value + step);
  };

  return (
    <View
      style={styles.row}
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

      <Text style={styles.value}>{value}</Text>

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
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  button: {
    width: 56,
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
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
});
