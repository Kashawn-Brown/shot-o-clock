// Mode picker for Create Party: Multiplayer vs Host-only (single-phone, D040/D050).
//
// The host's choice is a single `hostOnly` boolean; everything downstream (the
// Elimination/Grace fields hiding when Host-only is selected, the create + start flow)
// keys off that boolean and is identical either way. This component owns ONLY the
// visual — so swapping the two-card layout for a segmented pill later is a render/style
// change here, not a logic change anywhere else. The card descriptions reuse the same
// copy the old inline hints used.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HOST_ONLY_OFF_HINT, HOST_ONLY_ON_HINT } from '@/features/party/createPartyForm';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const MODES: {
  hostOnly: boolean;
  label: string;
  icon: IconName;
  description: string;
}[] = [
  {
    hostOnly: false,
    label: 'Multiplayer',
    icon: 'people-outline',
    description: HOST_ONLY_OFF_HINT,
  },
  {
    hostOnly: true,
    label: 'Host-only',
    icon: 'phone-portrait-outline',
    description: HOST_ONLY_ON_HINT,
  },
];

export function HostModePicker({
  hostOnly,
  onChange,
}: {
  hostOnly: boolean;
  onChange: (hostOnly: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      {MODES.map((mode) => {
        const selected = mode.hostOnly === hostOnly;
        return (
          <Pressable
            key={mode.label}
            onPress={() => onChange(mode.hostOnly)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.card, selected && styles.cardSelected]}
          >
            <Ionicons name={mode.icon} size={ICON_SIZE} color={COLORS.textPrimary} />
            <Text style={styles.cardLabel}>{mode.label}</Text>
            <Text style={styles.cardDescription}>{mode.description}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const ICON_SIZE = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  card: {
    flex: 1,
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    // 1px plain border by default; the selected card overrides to a 2px accent
    // border. The 1px inset keeps both states the same size (no layout shift).
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
    margin: -1, // absorb the extra 1px so selecting doesn't nudge the layout
  },
  cardLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  cardDescription: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
});
