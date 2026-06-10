// ProgressRing — a circular progress arc that fills clockwise from the top,
// driven by a 0..1 `progress` value (for the timer: timeRemaining / totalDuration,
// so the ring starts full and drains to empty).
//
// Pure React Native, no react-native-svg dependency (CLAUDE.md §10 gates adding
// deps). The arc is two half-disc "rotors" — one for each 180° — each clipped to
// its half of the circle and rotated about the center; a centre disc in the
// screen's background colour punches the donut hole so the result reads as a ring,
// not a pie. The countdown re-renders on its display tick (useCountdown), so the
// ring updates in step without an animation library.

import { StyleSheet, View } from 'react-native';

interface ProgressRingProps {
  /** Outer diameter in px. */
  size: number;
  /** Ring thickness in px. */
  strokeWidth: number;
  /** Fraction filled, 0..1 (clamped). */
  progress: number;
  /** Colour of the filled arc. */
  color: string;
  /** Colour of the unfilled arc (the track). */
  trackColor: string;
  /** Colour of the centre hole — match the screen background so the ring reads as an annulus. */
  centerColor: string;
  /** Centre content (e.g. the time text). Rendered above the hole. */
  children?: React.ReactNode;
}

export function ProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  centerColor,
  children,
}: ProgressRingProps): React.JSX.Element {
  const radius = size / 2;
  const clamped = Math.min(Math.max(progress, 0), 1);

  // The right half covers 0–50% (0–180°), the left half the rest. Each rotor is
  // a full-size layer (centred on the circle centre) holding a half-disc on the
  // side that is clipped away at 0°, so rotating it sweeps colour into view.
  const rightDeg = Math.min(clamped, 0.5) * 360;
  const leftDeg = Math.max(clamped - 0.5, 0) * 360;
  const holeSize = size - strokeWidth * 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track — full disc; the hole below turns it into the unfilled ring. */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: trackColor }]} />

      {/* Right half (0–50%). */}
      <View style={[styles.window, { width: radius, height: size, left: radius }]}>
        <View
          style={[styles.rotor, { width: size, height: size, left: -radius, transform: [{ rotate: `${rightDeg}deg` }] }]}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              width: radius,
              height: size,
              borderTopLeftRadius: radius,
              borderBottomLeftRadius: radius,
              backgroundColor: color,
            }}
          />
        </View>
      </View>

      {/* Left half (50–100%). */}
      <View style={[styles.window, { width: radius, height: size, left: 0 }]}>
        <View
          style={[styles.rotor, { width: size, height: size, left: 0, transform: [{ rotate: `${leftDeg}deg` }] }]}
        >
          <View
            style={{
              position: 'absolute',
              left: radius,
              width: radius,
              height: size,
              borderTopRightRadius: radius,
              borderBottomRightRadius: radius,
              backgroundColor: color,
            }}
          />
        </View>
      </View>

      {/* Donut hole. */}
      <View
        style={{
          position: 'absolute',
          width: holeSize,
          height: holeSize,
          borderRadius: holeSize / 2,
          backgroundColor: centerColor,
        }}
      />

      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  rotor: {
    position: 'absolute',
    top: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
