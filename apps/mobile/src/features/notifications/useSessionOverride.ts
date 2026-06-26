// Loads the per-session foreground-ALERT overrides for a party (D062/D064), exposing
// the EFFECTIVE values (override layered over global) for display, plus setters that
// persist the override. Drives the Surface B alert rows (app/party/[partyId]/settings).
//
// Alert fields (sound / haptic / sound-file) are read live by the Shot O'Clock screen,
// so persisting needs no reschedule. (Heads-up is no longer here — it's a host-
// controlled party setting via host_set_heads_up, Phase 16 / D063.)

import { useCallback, useEffect, useState } from 'react';

import {
  getGlobalAlertPrefs,
  resolveAlertPrefs,
} from '@/features/notifications/api/alertPreferences';
import {
  getSessionOverride,
  setSessionOverride,
} from '@/features/notifications/api/notificationPreferences';
import type { ShotSoundId } from '@/features/notifications/api/shotSounds';

interface UseSessionOverrideResult {
  loaded: boolean;
  // Effective foreground alert prefs (override ?? global):
  alertSoundEnabled: boolean;
  alertHapticEnabled: boolean;
  soundChoice: ShotSoundId;
  setAlertSoundEnabled: (enabled: boolean) => void;
  setAlertHapticEnabled: (enabled: boolean) => void;
  setSoundChoice: (id: ShotSoundId) => void;
}

export function useSessionOverride(partyId: string | undefined): UseSessionOverrideResult {
  const [loaded, setLoaded] = useState(false);
  const [alertSoundEnabled, setAlertSoundState] = useState(false);
  const [alertHapticEnabled, setAlertHapticState] = useState(true);
  const [soundChoice, setSoundChoiceState] = useState<ShotSoundId>('classic');

  useEffect(() => {
    if (!partyId) return;
    let active = true;
    Promise.all([getGlobalAlertPrefs(), getSessionOverride(partyId)]).then(
      ([globalAlert, override]) => {
        if (!active) return;
        const alert = resolveAlertPrefs(globalAlert, override);
        setAlertSoundState(alert.soundEnabled);
        setAlertHapticState(alert.hapticEnabled);
        setSoundChoiceState(alert.soundChoice);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [partyId]);

  const persist = useCallback(
    (patch: Parameters<typeof setSessionOverride>[1]) => {
      if (!partyId) return;
      void setSessionOverride(partyId, patch);
    },
    [partyId],
  );

  const setAlertSoundEnabled = useCallback(
    (enabled: boolean) => {
      setAlertSoundState(enabled);
      persist({ alertSoundEnabled: enabled });
    },
    [persist],
  );

  const setAlertHapticEnabled = useCallback(
    (enabled: boolean) => {
      setAlertHapticState(enabled);
      persist({ alertHapticEnabled: enabled });
    },
    [persist],
  );

  const setSoundChoice = useCallback(
    (id: ShotSoundId) => {
      setSoundChoiceState(id);
      persist({ shotOclockSound: id });
    },
    [persist],
  );

  return {
    loaded,
    alertSoundEnabled,
    alertHapticEnabled,
    soundChoice,
    setAlertSoundEnabled,
    setAlertHapticEnabled,
    setSoundChoice,
  };
}
