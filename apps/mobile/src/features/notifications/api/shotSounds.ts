// Registry of the available Shot O'Clock ALERT sounds — the foreground in-app sound
// the Shot O'Clock screen plays (expo-audio), NOT the backgrounded notification (that
// uses the OS default sound, D064). Maps a stable id → bundled asset, so a stored
// preference is a small id string rather than a path. require() must be static for
// Metro to bundle the asset, so each sound is a literal entry here.
//
// One entry today (the Phase 13 CC0 placeholder, see assets/sounds/CREDITS.md); the
// real identity sound + any additions land in Phase 17 — each is one more entry.

export type ShotSoundId = 'classic';

export interface ShotSound {
  id: ShotSoundId;
  label: string;
  // The bundled asset module (the result of require()); passed to useAudioPlayer.
  asset: number;
}

export const SHOT_SOUNDS: ShotSound[] = [
  {
    id: 'classic',
    label: 'Classic',
    asset: require('@/assets/sounds/shot-oclock-placeholder.mp3'),
  },
];

export const DEFAULT_SHOT_SOUND_ID: ShotSoundId = 'classic';

export function isShotSoundId(value: unknown): value is ShotSoundId {
  return typeof value === 'string' && SHOT_SOUNDS.some((sound) => sound.id === value);
}

/** The bundled asset for a sound id, falling back to the default if unknown. */
export function shotSoundAsset(id: ShotSoundId): number {
  return (SHOT_SOUNDS.find((sound) => sound.id === id) ?? SHOT_SOUNDS[0]).asset;
}
