import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AgeTermsGate } from '@/features/auth/AgeTermsGate';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useConsent } from '@/features/auth/useConsent';
import { COLORS, FONT_SIZE, SPACING } from '@/styles/tokens';

// Gates the navigator: nothing renders until (1) an anonymous identity is resolved
// — so no screen runs without an auth.uid for RLS / RPCs — and (2) the guest has
// confirmed legal age + terms once on this device.
function RootNavigator(): React.JSX.Element {
  const { status: authStatus } = useAuth();
  const { status: consentStatus, confirm } = useConsent();

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

  if (consentStatus === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </View>
    );
  }

  if (consentStatus === 'needed') {
    return <AgeTermsGate onConfirm={() => void confirm()} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

// Root layout. Headers are hidden globally — each screen draws its own header to
// match the wireframes. SafeAreaProvider backs the SafeAreaView used by the
// screens (the non-deprecated one from react-native-safe-area-context).
export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

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
