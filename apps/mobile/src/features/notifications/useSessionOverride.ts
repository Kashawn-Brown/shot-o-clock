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
  type PreWarningMinutes,
} from '@/features/notifications/api/notificationPreferences';
import { reapplyShotNotifications } from '@/features/notifications/api/shotNotification';

interface UseSessionOverrideResult {
  loaded: boolean;
  leadMinutes: PreWarningMinutes; // effective (override ?? global)
  setLeadMinutes: (minutes: PreWarningMinutes) => void;
}

export function useSessionOverride(partyId: string | undefined): UseSessionOverrideResult {
  const [loaded, setLoaded] = useState(false);
  const [leadMinutes, setLead] = useState<PreWarningMinutes>(2);

  useEffect(() => {
    if (!partyId) return;
    let active = true;
    Promise.all([getGlobalNotificationPrefs(), getSessionOverride(partyId)]).then(
      ([global, override]) => {
        if (!active) return;
        setLead(override?.leadMinutes ?? global.preWarningMinutes);
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

  return { loaded, leadMinutes, setLeadMinutes };
}
