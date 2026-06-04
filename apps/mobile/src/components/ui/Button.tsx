// Button — the shared tappable primitive used across every screen so the
// visual language is consistent from the first placeholder onward.
//
// Two variants for now, matching the wireframes:
//   - filled:  solid black background, white text (primary actions)
//   - outline: transparent with a black border (secondary actions)
//
// All colors/spacing come from tokens.ts. When the purple theme lands, this
// component changes once and every screen follows.

import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export type ButtonVariant = 'filled' | 'outline';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'filled',
  disabled = false,
  style,
}: ButtonProps): React.JSX.Element {
  const isFilled = variant === 'filled';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        isFilled ? styles.filled : styles.outline,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, isFilled ? styles.filledLabel : styles.outlineLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    backgroundColor: COLORS.buttonFilled,
  },
  outline: {
    backgroundColor: COLORS.buttonOutline,
    borderWidth: 1,
    borderColor: COLORS.buttonOutlineBorder,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
  },
  filledLabel: {
    color: COLORS.buttonFilledText,
  },
  outlineLabel: {
    color: COLORS.buttonOutlineText,
  },
});
