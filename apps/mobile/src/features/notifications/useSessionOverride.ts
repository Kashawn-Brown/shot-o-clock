// Loads the per-session overrides for a party (D062/D064), exposing the EFFECTIVE
// values (override layered over global) for display, plus setters that persist the
// override. Drives the Surface B settings rows (app/party/[partyId]/settings.tsx).
//
// The two notification-affecting fields (Heads-up on/off + lead time) re-reconcile the
// scheduled batch on change (reapplyShotNotifications) so they take effect immediately.
// The foreground alert fields (sound/haptic/sound-file) are read live by the Shot
// O'Clock screen, so they need no reschedule.

import { useCallback, useEffect, useState } from 'react';

import {
  getGlobalAlertPrefs,
  resolveAlertPrefs,
} from '@/features/notifications/api/alertPreferences';
import {
  getGlobalNotificationPrefs,
  getSessionOverride,
  setSessionOverride,
  type PreWarningMinutes,
} from '@/features/notifications/api/notificationPreferences';
import { reapplyShotNotifications } from '@/features/notifications/api/shotNotification';
import type { ShotSoundId } from '@/features/notifications/api/shotSounds';

interface UseSessionOverrideResult {
  loaded: boolean;
  // Effective foreground alert prefs (override ?? global):
  alertSoundEnabled: boolean;
  alertHapticEnabled: boolean;
  soundChoice: ShotSoundId;
  // Effective backgrounded Heads-up prefs (override ?? global):
  preWarningEnabled: boolean;
  leadMinutes: PreWarningMinutes;
  setAlertSoundEnabled: (enabled: boolean) => void;
  setAlertHapticEnabled: (enabled: boolean) => void;
  setSoundChoice: (id: ShotSoundId) => void;
  setPreWarningEnabled: (enabled: boolean) => void;
  setLeadMinutes: (minutes: PreWarningMinutes) => void;
}

export function useSessionOverride(partyId: string | undefined): UseSessionOverrideResult {
  const [loaded, setLoaded] = useState(false);
  const [alertSoundEnabled, setAlertSoundState] = useState(false);
  const [alertHapticEnabled, setAlertHapticState] = useState(true);
  const [soundChoice, setSoundChoiceState] = useState<ShotSoundId>('classic');
  const [preWarningEnabled, setPreWarningState] = useState(true);
  const [leadMinutes, setLeadState] = useState<PreWarningMinutes>(2);

  useEffect(() => {
    if (!partyId) return;
    let active = true;
    Promise.all([
      getGlobalAlertPrefs(),
      getGlobalNotificationPrefs(),
      getSessionOverride(partyId),
    ]).then(([globalAlert, globalNotif, override]) => {
      if (!active) return;
      const alert = resolveAlertPrefs(globalAlert, override);
      setAlertSoundState(alert.soundEnabled);
      setAlertHapticState(alert.hapticEnabled);
      setSoundChoiceState(alert.soundChoice);
      setPreWarningState(override?.preWarningEnabled ?? globalNotif.preWarningEnabled);
      setLeadState(override?.leadMinutes ?? globalNotif.preWarningMinutes);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [partyId]);

  // Persist an override patch, optionally re-reconciling the scheduled batch (only the
  // notification-affecting fields need it; the alert fields are read live in-app).
  const persist = useCallback(
    (patch: Parameters<typeof setSessionOverride>[1], reschedule: boolean) => {
      if (!partyId) return;
      void (async () => {
        await setSessionOverride(partyId, patch);
        if (reschedule) await reapplyShotNotifications();
      })();
    },
    [partyId],
  );

  const setAlertSoundEnabled = useCallback(
    (enabled: boolean) => {
      setAlertSoundState(enabled);
      persist({ alertSoundEnabled: enabled }, false);
    },
    [persist],
  );

  const setAlertHapticEnabled = useCallback(
    (enabled: boolean) => {
      setAlertHapticState(enabled);
      persist({ alertHapticEnabled: enabled }, false);
    },
    [persist],
  );

  const setSoundChoice = useCallback(
    (id: ShotSoundId) => {
      setSoundChoiceState(id);
      persist({ shotOclockSound: id }, false);
    },
    [persist],
  );

  const setPreWarningEnabled = useCallback(
    (enabled: boolean) => {
      setPreWarningState(enabled);
      persist({ preWarningEnabled: enabled }, true);
    },
    [persist],
  );

  const setLeadMinutes = useCallback(
    (minutes: PreWarningMinutes) => {
      setLeadState(minutes);
      persist({ leadMinutes: minutes }, true);
    },
    [persist],
  );

  return {
    loaded,
    alertSoundEnabled,
    alertHapticEnabled,
    soundChoice,
    preWarningEnabled,
    leadMinutes,
    setAlertSoundEnabled,
    setAlertHapticEnabled,
    setSoundChoice,
    setPreWarningEnabled,
    setLeadMinutes,
  };
}
