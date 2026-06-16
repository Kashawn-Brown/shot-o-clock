// First-launch notification priming screen. Shown once, after name/consent and
// before the home screen, so the OS permission dialog only fires when the user has
// already opted in (iOS allows that dialog only once — see api/notificationPermission).
// Either choice records the prompt as shown and advances; the user can revisit the
// decision later from Settings (Phase 15).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { requestNotificationPermission } from '@/features/notifications/api/notificationPermission';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '@/styles/tokens';

type NotificationPermissionGateProps = {
  onComplete: () => void;
};

export function NotificationPermissionGate({
  onComplete,
}: NotificationPermissionGateProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const enable = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await requestNotificationPermission();
    } finally {
      // Advance regardless of grant/deny — the choice is recorded and Settings
      // (Phase 15) lets the user change it. Denial is handled gracefully: the app
      // works fully without notifications, just without the backgrounded alert.
      onComplete();
    }
  };

  const skip = (): void => {
    if (busy) return;
    onComplete();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>{"Don't miss Shot O'Clock"}</Text>
        <Text style={styles.copy}>
          {
            "Get alerted the moment it's time to take your shot — even when your phone is locked."
          }
        </Text>
        <Text style={styles.subcopy}>
          {'You can change this anytime in Settings. It only affects your own phone.'}
        </Text>
      </View>

      <View style={styles.footer}>
        <Button label="Enable notifications" onPress={enable} disabled={busy} />
        <Pressable onPress={skip} accessibilityRole="button" hitSlop={SPACING.sm} disabled={busy}>
          <Text style={styles.skip}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  copy: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  subcopy: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  footer: {
    gap: SPACING.md,
    alignItems: 'center',
  },
  skip: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    textDecorationLine: 'underline',
    paddingVertical: SPACING.sm,
  },
});
