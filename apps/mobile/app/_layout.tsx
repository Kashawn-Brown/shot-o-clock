import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Root layout. Headers are hidden globally — each screen draws its own header
// to match the wireframes. SafeAreaProvider backs the SafeAreaView used by the
// screens (the non-deprecated one from react-native-safe-area-context).
export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
