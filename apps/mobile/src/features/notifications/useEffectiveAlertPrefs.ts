// Read-only effective foreground ALERT prefs for a party (global layered with the
// per-session override, D064). Used by the Shot O'Clock screen to decide whether to
// play the sound, fire the haptic, and which sound to play. Exposes `loaded` so the
// window-open effect can wait for the real prefs rather than firing on the defaults.

import { useEffect, useState } from 'react';

import {
  getEffectiveAlertPrefs,
  type EffectiveAlertPrefs,
} from '@/features/notifications/api/alertPreferences';
import { DEFAULT_SHOT_SOUND_ID } from '@/features/notifications/api/shotSounds';

export interface EffectiveAlertPrefsState extends EffectiveAlertPrefs {
  loaded: boolean;
}

const LOADING_DEFAULT: EffectiveAlertPrefs = {
  soundEnabled: false, // matches the global default until the real value loads
  hapticEnabled: true,
  soundChoice: DEFAULT_SHOT_SOUND_ID,
};

export function useEffectiveAlertPrefs(partyId: string | undefined): EffectiveAlertPrefsState {
  const [prefs, setPrefs] = useState<EffectiveAlertPrefsState>({ ...LOADING_DEFAULT, loaded: false });

  useEffect(() => {
    let active = true;
    getEffectiveAlertPrefs(partyId).then((loaded) => {
      if (active) setPrefs({ ...loaded, loaded: true });
    });
    return () => {
      active = false;
    };
  }, [partyId]);

  return prefs;
}
