// Launch-time push-token registration. Once an anonymous identity is ready, this
// registers the device's push token if notification permission is already granted
// (syncPushToken no-ops otherwise). It also exercises the RPC's reclaim-on-reset
// path: after "Reset this device" the identity tree remounts, this runs again under
// the new identity, and the same physical token is reassigned server-side.
//
// The onboarding grant has its own immediate trigger (NotificationPermissionGate) —
// this hook covers every subsequent launch.

import { useEffect, useRef } from 'react';

import { syncPushToken } from '@/features/notifications/api/pushToken';

/**
 * @param authReady true once an authenticated session exists (the RPC needs one).
 */
export function usePushTokenRegistration(authReady: boolean): void {
  // Run at most once per mount; a remount (e.g. after a device reset) re-arms it.
  const ran = useRef(false);

  useEffect(() => {
    if (!authReady || ran.current) return;
    ran.current = true;
    void syncPushToken();
  }, [authReady]);
}
