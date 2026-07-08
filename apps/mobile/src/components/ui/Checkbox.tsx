// Checkbox — a labeled, tappable checkbox primitive. React Native has no built-in
// checkbox, and the age/terms gate needs one; kept here as shared UI so later
// screens reuse the same look. Colors/spacing come from tokens.ts.

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/styles/tokens';

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
};

export function Checkbox({ checked, onToggle, label }: CheckboxProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.row}
      hitSlop={SPACING.sm}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Ionicons name="checkmark" size={16} color={COLORS.buttonFilledText} />}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.buttonOutlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    // Checked (active) state — brand Indigo (reserved-moment).
    backgroundColor: COLORS.brandPrimary,
    borderColor: COLORS.brandPrimary,
  },
  label: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
});
