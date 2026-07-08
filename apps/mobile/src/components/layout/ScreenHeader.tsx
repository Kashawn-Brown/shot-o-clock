// ScreenHeader — the shared top bar for pushed screens: an optional back arrow, a
// title, and an optional right-side slot. A subtle bottom border separates it from
// the body. Replaces the per-screen header that was re-implemented on every screen.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '@/styles/tokens';

const BACK_ICON_SIZE = 22;

export function ScreenHeader({
  title,
  onBack,
  backDisabled = false,
  right,
}: {
  title: string;
  onBack?: () => void;
  backDisabled?: boolean;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          disabled={backDisabled}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={BACK_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {/* Spacer pushes any right-side content to the end; with no right content the
          title simply stays left, matching the old per-screen headers. */}
      <View style={styles.spacer} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    // Subtle separator from the body (the chosen header distinction).
    borderBottomWidth: 2,
    borderWidth: 0,
    borderBottomColor: `${COLORS.brandNavy}66`.toLowerCase(),
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  spacer: {
    flex: 1,
  },
});
