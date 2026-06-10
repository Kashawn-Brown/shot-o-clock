// ProgressRing — a circular progress arc, drawn with react-native-svg. Driven by
// a 0..1 `progress` value (for the timer: timeRemaining / totalDuration, so the
// ring starts full and drains to empty as the value falls).
//
// The arc is one SVG <Circle> whose stroke-dash is the full circumference and
// whose stroke-dashoffset hides the spent portion — a single continuous value,
// so it animates smoothly with no boundary snap (the earlier pure-RN two-half-disc
// version snapped at 50% and swept the wrong way). Rotated -90° so the arc starts
// at 12 o'clock and drains clockwise. The countdown re-renders on its display tick
// (useCountdown), which updates the offset; no animation library needed.

import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ProgressRingProps {
  /** Outer diameter in px. */
  size: number;
  /** Ring thickness in px. */
  strokeWidth: number;
  /** Fraction filled, 0..1 (clamped). */
  progress: number;
  /** Colour of the filled (remaining) arc. */
  color: string;
  /** Colour of the unfilled arc (the track). */
  trackColor: string;
  /** Centre content (e.g. the time text). Rendered above the ring. */
  children?: React.ReactNode;
}

export function ProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  children,
}: ProgressRingProps): React.JSX.Element {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const center = size / 2;
  // Inset the radius by half the stroke so the ring sits fully inside the box.
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Offset hides the spent portion; at progress 1 nothing is hidden (full ring),
  // at 0 the whole circumference is hidden (just the track shows).
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
