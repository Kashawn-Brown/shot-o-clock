import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ResetProvider } from '@/features/auth/ResetProvider';
import { OnboardingGate } from '@/features/auth/OnboardingGate';
import { useConsent } from '@/features/auth/useConsent';
import { useDisplayName } from '@/features/auth/useDisplayName';
import { NotificationPermissionGate } from '@/features/notifications/NotificationPermissionGate';
import { configureNotifications } from '@/features/notifications/api/shotNotification';
import { useNotificationPrompt } from '@/features/notifications/useNotificationPrompt';
import { usePushTokenRegistration } from '@/features/notifications/usePushTokenRegistration';
import { env } from '@/lib/env';
import { COLORS, FONT_SIZE, SPACING } from '@/styles/tokens';

// Crash + error reporting (Sentry). Initialized once at module load, only when a DSN is
// present (env.ts — optional). Enabled in dev right now for end-to-end verification;
// gate to !__DEV__ before the production build. Performance tracing is off to conserve
// the free-tier quota — this is crash/error capture, not APM.
if (env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Gates the navigator: nothing renders until (1) an anonymous identity is resolved
// — so no screen runs without an auth.uid for RLS / RPCs, (2) first-launch
// onboarding is complete (display name set + legal age / terms confirmed), and
// (3) the one-time notification priming step has been shown. The name and consent
// persist independently, but are collected on one screen.
function RootNavigator(): React.JSX.Element {
  const { status: authStatus } = useAuth();
  const { status: consentStatus, confirm } = useConsent();
  const { status: nameStatus, save: saveName } = useDisplayName();
  const { status: notificationStatus, complete: completeNotificationPrompt } =
    useNotificationPrompt();

  // Once a session exists, register this device's push token on launch if permission
  // is already granted (no-ops otherwise). The onboarding grant registers separately.
  usePushTokenRegistration(authStatus === 'ready');

  if (authStatus === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </View>
    );
  }

  if (authStatus === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {"Couldn't start a guest session. Check your connection and reopen the app."}
        </Text>
      </View>
    );
  }

  if (consentStatus === 'loading' || nameStatus === 'loading' || notificationStatus === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </View>
    );
  }

  if (consentStatus === 'needed' || nameStatus === 'needed') {
    return (
      <OnboardingGate
        onComplete={(name) => {
          void saveName(name);
          void confirm();
        }}
      />
    );
  }

  // Notification priming runs after name/consent and before the navigator, so the
  // OS permission dialog only fires once the user has a name and has reached the
  // end of onboarding (plan.md Phase 14).
  if (notificationStatus === 'needed') {
    return <NotificationPermissionGate onComplete={() => void completeNotificationPrompt()} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

// Root layout. Headers are hidden globally — each screen draws its own header to
// match the wireframes. SafeAreaProvider backs the SafeAreaView used by the
// screens (the non-deprecated one from react-native-safe-area-context).
function RootLayout(): React.JSX.Element {
  // Install the notification handler + Android channel once at startup, before any
  // scheduled Shot O'Clock notification can fire (Phase 14).
  useEffect(() => {
    void configureNotifications();
  }, []);

  // ResetProvider sits above the keyed AuthProvider: "Reset this device" (D018)
  // bumps the identity epoch, remounting the whole identity tree so the onboarding
  // gates re-read the now-cleared storage and a fresh anonymous guest is created.
  return (
    <SafeAreaProvider>
      <ResetProvider>
        {(epoch) => (
          <AuthProvider key={epoch}>
            <RootNavigator />
          </AuthProvider>
        )}
      </ResetProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

// Wrap the root so Sentry can capture render errors and attach navigation context.
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },
});
