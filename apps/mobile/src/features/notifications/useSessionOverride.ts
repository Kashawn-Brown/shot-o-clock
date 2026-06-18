// Loads the per-session notification override for a party (D062), exposing the
// EFFECTIVE values (override layered over the global defaults) for display, plus
// setters that persist the override and re-reconcile the scheduled batch at once
// (reapplyShotNotifications) so a change takes effect without waiting for the next
// round. Drives the Surface B settings rows (app/party/[partyId]/settings.tsx).

import { useCallback, useEffect, useState } from 'react';

import {
  getGlobalNotificationPrefs,
  getSessionOverride,
  setSessionOverride,
  type AlertMode,
  type PreWarningMinutes,
} from '@/features/notifications/api/notificationPreferences';
import { reapplyShotNotifications } from '@/features/notifications/api/shotNotification';

interface UseSessionOverrideResult {
  loaded: boolean;
  // From global — when pre-warning is off globally, the lead override can't do
  // anything, so the screen greys it with a note.
  preWarningEnabled: boolean;
  leadMinutes: PreWarningMinutes; // effective (override ?? global)
  alertMode: AlertMode; // effective (override ?? 'sound')
  setLeadMinutes: (minutes: PreWarningMinutes) => void;
  setAlertMode: (mode: AlertMode) => void;
}

export function useSessionOverride(partyId: string | undefined): UseSessionOverrideResult {
  const [loaded, setLoaded] = useState(false);
  const [preWarningEnabled, setPreWarningEnabled] = useState(true);
  const [leadMinutes, setLead] = useState<PreWarningMinutes>(2);
  const [alertMode, setMode] = useState<AlertMode>('sound');

  useEffect(() => {
    if (!partyId) return;
    let active = true;
    Promise.all([getGlobalNotificationPrefs(), getSessionOverride(partyId)]).then(
      ([global, override]) => {
        if (!active) return;
        setPreWarningEnabled(global.preWarningEnabled);
        setLead(override?.leadMinutes ?? global.preWarningMinutes);
        setMode(override?.alertMode ?? 'sound');
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [partyId]);

  const setLeadMinutes = useCallback(
    (minutes: PreWarningMinutes) => {
      if (!partyId) return;
      setLead(minutes);
      void (async () => {
        await setSessionOverride(partyId, { leadMinutes: minutes });
        await reapplyShotNotifications();
      })();
    },
    [partyId],
  );

  const setAlertMode = useCallback(
    (mode: AlertMode) => {
      if (!partyId) return;
      setMode(mode);
      void (async () => {
        await setSessionOverride(partyId, { alertMode: mode });
        await reapplyShotNotifications();
      })();
    },
    [partyId],
  );

  return { loaded, preWarningEnabled, leadMinutes, alertMode, setLeadMinutes, setAlertMode };
}
