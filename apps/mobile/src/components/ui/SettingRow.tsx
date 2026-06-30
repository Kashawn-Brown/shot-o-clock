// SettingRow — one settings-list row: a title + optional description, with a
// trailing element (a forward chevron by default; pass `trailing` to override —
// e.g. a Switch, see ToggleRow). Tappable when `onPress` is given, a plain row
// otherwise. Shared by the global (/settings) and per-session (party) surfaces.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '@/styles/tokens';

const CHEVRON_SIZE = 20;

export function SettingRow({
  title,
  description,
  onPress,
  trailing,
  danger = false,
}: {
  title: string;
  description?: string;
  onPress?: () => void;
  // Defaults to a forward chevron. Pass `null` for no trailing element, or a node
  // (e.g. a Switch) to replace it.
  trailing?: React.ReactNode;
  danger?: boolean;
}): React.JSX.Element {
  const end =
    trailing !== undefined ? (
      trailing
    ) : (
      <Ionicons name="chevron-forward" size={CHEVRON_SIZE} color={COLORS.textSecondary} />
    );
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {end}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
