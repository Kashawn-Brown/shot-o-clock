// ErrorBanner — the shared surface for user-facing errors, so every screen
// reports a failure the same way instead of inlining its own text or firing a
// raw alert dialog (CLAUDE.md §5.7). Renders nothing when there is no message,
// so callers can bind it straight to their error state. Uses the semantic
// `danger` tokens, which survive the monotone phase.

import { StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/styles/tokens';

type ErrorBannerProps = {
  message: string | null;
};

export function ErrorBanner({ message }: ErrorBannerProps): React.JSX.Element | null {
  if (message === null || message.length === 0) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.dangerSurface,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  text: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
  },
});
