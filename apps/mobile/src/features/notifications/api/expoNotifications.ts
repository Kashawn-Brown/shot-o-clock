// Single import surface for expo-notifications — the one place the rest of the app
// pulls expo-notifications APIs through, so a future swap or shim lives here only.
//
// HISTORY: Phase 14 imported these from deep submodule paths (e.g.
// 'expo-notifications/build/scheduleNotificationAsync') instead of the
// 'expo-notifications' barrel. The sole reason was to avoid the barrel's
// push-token auto-registration side effect, which calls warnOfExpoGoPushUsage()
// — a console.error on Android in Expo Go, where remote push was removed in SDK
// 53. We only used local scheduled notifications then, so that noise was pure cost.
//
// Phase 16 reverses the workaround (D063). The project now runs on an EAS
// development build, where remote push IS supported and the Expo-Go warning never
// fires (it is gated on isRunningInExpoGo(), which is false outside Expo Go). So
// we import from the barrel again — version-robust (no pinned deep paths) and it
// gives us the push-token API. Loading the barrel intentionally runs the device
// push-token auto-registration side effect, which is now the desired behavior: it
// keeps a rotated device token registered with Expo's push service.

export {
  setNotificationHandler,
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  setNotificationChannelAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  AndroidImportance,
  // Push (Phase 16): obtain the Expo push token for server-side delivery. Device
  // token rotation is handled by the barrel's own auto-registration — the Expo
  // push token itself is stable across rotation, so no listener is needed here.
  getExpoPushTokenAsync,
} from 'expo-notifications';

// PermissionStatus is the shared permissions enum and lives in expo-modules-core —
// the notifications barrel does NOT re-export it, so it keeps its own source.
export { PermissionStatus } from 'expo-modules-core';
