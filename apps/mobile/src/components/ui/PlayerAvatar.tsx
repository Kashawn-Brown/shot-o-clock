// PlayerAvatar — a colored circle with a player's initials, used wherever players are
// listed (lobby, roster sheet, round results, final summary). The color is a
// deterministic hash of the player's stable id into AVATAR_COLORS, so it never re-rolls
// on re-render and a given player looks identical on every screen; two players who share
// initials still differ by color because their ids differ.

import { StyleSheet, Text, View } from 'react-native';

import { AVATAR_COLORS, FONT_WEIGHT } from '@/styles/tokens';

/** Up to two initials: one letter for a single-word name, first-of-first + first-of-last
 *  for two-or-more words. Falls back to "?" for an empty/blank name. */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/** Deterministic avatar background color: hash the stable key into AVATAR_COLORS. */
export function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0; // wrap to a 32-bit int
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type PlayerAvatarProps = {
  /** Stable per-player key (the party_player_id) — drives the color. */
  id: string;
  /** Display name — drives the initials. */
  name: string;
  /** Diameter in px (default 40). */
  size?: number;
};

export function PlayerAvatar({ id, name, size = 40 }: PlayerAvatarProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(id) },
      ]}
    >
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.4) }]} numberOfLines={1}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHT.bold,
  },
});
