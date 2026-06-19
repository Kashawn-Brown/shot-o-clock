// Loads the global (device-wide) foreground ALERT preferences and exposes setters
// that persist + update local state optimistically. Drives the Surface A Alert rows
// (app/settings.tsx). No reschedule — the foreground alert reads prefs live when the
// shot window opens (useEffectiveAlertPrefs).

import { useCallback, useEffect, useState } from 'react';

import {
  getGlobalAlertPrefs,
  setAlertHapticEnabled,
  setAlertSoundEnabled,
  setShotOclockSound,
  type GlobalAlertPrefs,
} from '@/features/notifications/api/alertPreferences';
import type { ShotSoundId } from '@/features/notifications/api/shotSounds';

interface UseGlobalAlertPrefsResult {
  prefs: GlobalAlertPrefs | null; // null while loading
  setSoundEnabled: (enabled: boolean) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setSoundChoice: (id: ShotSoundId) => void;
}

export function useGlobalAlertPrefs(): UseGlobalAlertPrefsResult {
  const [prefs, setPrefs] = useState<GlobalAlertPrefs | null>(null);

  useEffect(() => {
    let active = true;
    getGlobalAlertPrefs().then((loaded) => {
      if (active) setPrefs(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, soundEnabled: enabled } : prev));
    void setAlertSoundEnabled(enabled);
  }, []);

  const setHapticEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, hapticEnabled: enabled } : prev));
    void setAlertHapticEnabled(enabled);
  }, []);

  const setSoundChoice = useCallback((id: ShotSoundId) => {
    setPrefs((prev) => (prev ? { ...prev, soundChoice: id } : prev));
    void setShotOclockSound(id);
  }, []);

  return { prefs, setSoundEnabled, setHapticEnabled, setSoundChoice };
}
