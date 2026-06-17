// Local-notification surface for expo-notifications, imported from its submodules
// rather than the package barrel ('expo-notifications').
//
// WHY NOT the barrel: importing 'expo-notifications' runs
// DevicePushTokenAutoRegistration.fx as an import side effect. That module adds a
// global device-push-token listener on load (TokenEmitter.addPushTokenListener),
// which calls warnOfExpoGoPushUsage() — a console.error in Expo Go on Android about
// remote push being removed from Expo Go in SDK 53. We use ONLY local scheduled
// notifications — no push tokens, no remote registration — so that auto-registration
// is pure noise here, and no public API can un-add the listener after import.
//
// THE FIX: pull just the functions/enums we use directly from their submodules. Only
// index.js, the .fx itself, and getExpoPushTokenAsync (unused) reference the .fx, so
// none of these imports load it — the push auto-registration never runs. This is the
// supported way to opt out of the push side effect, kept in one place so the deep
// import paths (pinned to expo-notifications ~0.32.x / SDK 54) are documented and
// revisited together on any SDK upgrade.

export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export { default as scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { default as cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
export { default as getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
export { default as setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
export {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
export { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
export { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
// PermissionStatus is the shared permissions enum from expo-modules-core (the barrel
// re-exports it); importing it from the source keeps us off the barrel entirely.
export { PermissionStatus } from 'expo-modules-core';
