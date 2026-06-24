// Party route group layout.
//
// A pass-through Stack with headers hidden (each screen draws its own header).
// Roster is presented as a modal so it overlays the timer/results screen it was
// opened from.
//
// gestureEnabled: false on the lobby + in-game screens disables the iOS edge-swipe
// back; the Android hardware/gesture back is blocked in-screen via useBlockBack.
// Together they stop OS back from popping a host out of their live party (the
// in-app back arrows were already removed in D044) — Phase 16 bug fix.

import { Stack } from 'expo-router';

export default function PartyLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="lobby" options={{ gestureEnabled: false }} />
      <Stack.Screen name="timer" options={{ gestureEnabled: false }} />
      <Stack.Screen name="shot-oclock" options={{ gestureEnabled: false }} />
      <Stack.Screen name="results" options={{ gestureEnabled: false }} />
      <Stack.Screen name="roster" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
