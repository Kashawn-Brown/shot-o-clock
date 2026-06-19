// Reset this device (D018) — return the device to a fresh first-launch state.
//
// This is the SINGLE place that knows the full set of device-side state to wipe.
// Each storage module owns its own key and exposes a clear*(); this orchestrator
// calls them all. When a later Phase 15 task adds a new device-side store (sound
// preference, party-creation defaults, per-session notification overrides — D062),
// add its clear*() here so reset stays complete. (SecureStore has no key-listing
// API, so there is no way to "clear everything" generically — this list is the
// source of truth.)
//
// Deliberately LOCAL only: no server RPC is called. The user's party_players row
// stays server-side and is handled by the party's own lifecycle (inactivity
// auto-end). After reset + the remount that follows, AuthProvider bootstraps a
// fresh anonymous guest, so the device is no longer that member.

import { clearConsent } from '@/features/auth/api/consent';
import { clearDisplayName } from '@/features/auth/api/displayName';
import { clearNotificationsPrompted } from '@/features/notifications/api/notificationPermission';
import {
  clearPreWarningEnabled,
  clearPreWarningMinutes,
  clearSessionOverride,
  clearShotOclockNotificationEnabled,
} from '@/features/notifications/api/notificationPreferences';
import { cancelShotNotifications } from '@/features/notifications/api/shotNotification';
import { clearLeftPartyId } from '@/features/party/leftParty';
import { supabase } from '@/lib/supabase';

export async function resetDevice(): Promise<void> {
  // Cancel any pending local notifications first, in case reset fires while a game
  // is still scheduled — otherwise a stale Shot O'Clock alarm could fire post-reset.
  await cancelShotNotifications();

  // Clear every device-side store. Each module owns its key.
  // TODO(claude, 2026-06-17): add clear*() here as later Phase 15 tasks land —
  //   sound preference (sound task) and party-creation defaults (defaults task).
  await Promise.all([
    clearDisplayName(),
    clearConsent(),
    clearNotificationsPrompted(),
    clearPreWarningMinutes(),
    clearShotOclockNotificationEnabled(),
    clearPreWarningEnabled(),
    clearSessionOverride(),
    clearLeftPartyId(),
  ]);

  // Sign out LAST: scope 'local' drops the in-memory + persisted anonymous session
  // (the secureStorage adapter's removeItem wipes all chunks + the count marker) and
  // does NOT ask the server to revoke a token we're discarding anyway. The remount
  // that follows reset re-runs AuthProvider, which creates a fresh anonymous guest.
  await supabase.auth.signOut({ scope: 'local' });
}
