// Loads the global (device-wide) notification preferences and exposes setters that
// persist + update local state optimistically. Drives the Surface A settings rows
// (app/settings.tsx). No reschedule here: global settings are reached from Home,
// out of any active game, so they take effect at the next game's scheduling.

import { useCallback, useEffect, useState } from 'react';

import {
  getGlobalNotificationPrefs,
  setPreWarningEnabled,
  setPreWarningMinutes,
  setShotOclockEnabled,
  type GlobalNotificationPrefs,
  type PreWarningMinutes,
} from '@/features/notifications/api/notificationPreferences';

interface UseGlobalNotificationPrefsResult {
  prefs: GlobalNotificationPrefs | null; // null while loading
  setShotOclock: (enabled: boolean) => void;
  setPreWarning: (enabled: boolean) => void;
  setLeadMinutes: (minutes: PreWarningMinutes) => void;
}

export function useGlobalNotificationPrefs(): UseGlobalNotificationPrefsResult {
  const [prefs, setPrefs] = useState<GlobalNotificationPrefs | null>(null);

  useEffect(() => {
    let active = true;
    getGlobalNotificationPrefs().then((loaded) => {
      if (active) setPrefs(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const setShotOclock = useCallback((enabled: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, shotOclockEnabled: enabled } : prev));
    void setShotOclockEnabled(enabled);
  }, []);

  const setPreWarning = useCallback((enabled: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, preWarningEnabled: enabled } : prev));
    void setPreWarningEnabled(enabled);
  }, []);

  const setLeadMinutes = useCallback((minutes: PreWarningMinutes) => {
    setPrefs((prev) => (prev ? { ...prev, preWarningMinutes: minutes } : prev));
    void setPreWarningMinutes(minutes);
  }, []);

  return { prefs, setShotOclock, setPreWarning, setLeadMinutes };
}
