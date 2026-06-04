// Party route group layout.
//
// Phase 3 placeholder: a pass-through Stack with headers hidden (each screen
// draws its own header). Roster is presented as a modal so it overlays the
// timer/results screen it was opened from. This file becomes the party context
// provider (subscribing to party state) in a later phase.

import { Stack } from 'expo-router';

export default function PartyLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="roster" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
