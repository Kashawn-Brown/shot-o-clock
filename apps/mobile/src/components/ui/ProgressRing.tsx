// ProgressRing — a circular progress arc, drawn with react-native-svg. Driven by
// a 0..1 `progress` value (for the timer: timeRemaining / totalDuration, so the
// ring starts full and drains to empty as the value falls).
//
// The arc is one SVG <Circle> whose stroke-dash is the full circumference and
// whose stroke-dashoffset hides the spent portion. Rotated -90° to start at 12
// o'clock; the Svg is mirrored horizontally (scaleX -1, on the Svg only so the
// centre text doesn't flip) so the arc drains CLOCKWISE.
//
// Smoothness: progress arrives in ~250ms steps from useCountdown's display tick.
// Snapping the offset to each step looks choppy, so the offset is an Animated.Value
// that timing-animates to each new target over one tick (linear) — back-to-back
// linear segments read as one continuous drain. strokeDashoffset is an SVG prop, so
// the animation runs on the JS driver (useNativeDriver: false).

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Matches useCountdown's display tick so each segment animates exactly up to the
// next value with no gap or overshoot.
const TICK_MS = 250;

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
  const targetOffset = circumference * (1 - clamped);

  const animatedOffset = useRef(new Animated.Value(targetOffset)).current;

  useEffect(() => {
    const anim = Animated.timing(animatedOffset, {
      toValue: targetOffset,
      duration: TICK_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [targetOffset, animatedOffset]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* scaleX -1 mirrors the draw direction to clockwise; only the Svg is
          mirrored, so the centre children below are unaffected. */}
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, styles.mirror]}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  mirror: {
    transform: [{ scaleX: -1 }],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
