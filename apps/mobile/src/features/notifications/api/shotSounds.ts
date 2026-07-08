// Registry of the available Shot O'Clock ALERT sounds — the foreground in-app sound
// the Shot O'Clock screen plays (expo-audio), NOT the backgrounded notification (that
// uses the OS default sound, D064). Maps a stable id → bundled asset, so a stored
// preference is a small id string rather than a path. require() must be static for
// Metro to bundle the asset, so each sound is a literal entry here.
//
// The default is the glasses-clink sound, shown as "Classic" (id 'cheers'); the original
// CC0 alarm is shown as "Alarm" (id 'classic'). The rest are Phase 17 additions (Mixkit,
// see CREDITS.md). The id/label split is intentional — ids are the stable storage keys
// (never rename them), labels are just display text. The Settings picker reads this list.

export type ShotSoundId =
  | 'classic'
  | 'cheers'
  | 'ice-drop'
  | 'bubbles'
  | 'pop'
  | 'chime'
  | 'ding'
  | 'confirm'
  | 'double-beep'
  | 'blip'
  | 'elevator'
  | 'power-up';

export interface ShotSound {
  id: ShotSoundId;
  label: string;
  // The bundled asset module (the result of require()); passed to useAudioPlayer.
  asset: number;
}

export const SHOT_SOUNDS: ShotSound[] = [
  // Default first, then the drink-themed sounds, the upbeat tones, the plainer tones,
  // and the Alarm last (it's the harshest — demoted from default).
  { id: 'cheers', label: 'Classic', asset: require('@/assets/sounds/shot-oclock-cheers.wav') },
  { id: 'ice-drop', label: 'Ice Drop', asset: require('@/assets/sounds/shot-oclock-ice-drop.wav') },
  { id: 'bubbles', label: 'Bubbles', asset: require('@/assets/sounds/shot-oclock-bubbles.wav') },
  { id: 'pop', label: 'Pop', asset: require('@/assets/sounds/shot-oclock-pop.wav') },
  { id: 'ding', label: 'Ding', asset: require('@/assets/sounds/shot-oclock-ding.wav') },
  { id: 'chime', label: 'Chime', asset: require('@/assets/sounds/shot-oclock-chime.wav') },
  { id: 'power-up', label: 'Power Up', asset: require('@/assets/sounds/shot-oclock-power-up.wav') },
  { id: 'confirm', label: 'Confirm', asset: require('@/assets/sounds/shot-oclock-confirm.wav') },
  {
    id: 'double-beep',
    label: 'Double Beep',
    asset: require('@/assets/sounds/shot-oclock-double-beep.wav'),
  },
  { id: 'blip', label: 'Blip', asset: require('@/assets/sounds/shot-oclock-blip.wav') },
  { id: 'elevator', label: 'Elevator', asset: require('@/assets/sounds/shot-oclock-elevator.wav') },
  { id: 'classic', label: 'Alarm', asset: require('@/assets/sounds/shot-oclock-placeholder.mp3') },
];

export const DEFAULT_SHOT_SOUND_ID: ShotSoundId = 'cheers';

export function isShotSoundId(value: unknown): value is ShotSoundId {
  return typeof value === 'string' && SHOT_SOUNDS.some((sound) => sound.id === value);
}

/** The bundled asset for a sound id, falling back to the default if unknown. */
export function shotSoundAsset(id: ShotSoundId): number {
  return (SHOT_SOUNDS.find((sound) => sound.id === id) ?? SHOT_SOUNDS[0]).asset;
}
