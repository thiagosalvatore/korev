import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const TURN_MS = 800;
const REDUCED_TURN_MS = 3000;
const RADIUS = 9;
const ARC = 2 * Math.PI * RADIUS * 0.3;

export function LoadingRing({
  size = 16,
  color,
}: {
  size?: number;
  color: string;
}) {
  const reducedMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(
      withTiming(360, {
        duration: reducedMotion ? REDUCED_TURN_MS : TURN_MS,
        easing: Easing.linear,
      }),
      -1,
    );
    return () => cancelAnimation(turn);
  }, [turn, reducedMotion]);
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value}deg` }],
  }));
  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[{ width: size, height: size }, spin]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={12}
          cy={12}
          r={RADIUS}
          stroke={color}
          strokeWidth={2.5}
          opacity={0.2}
        />
        <Circle
          cx={12}
          cy={12}
          r={RADIUS}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={[ARC, 100]}
        />
      </Svg>
    </Animated.View>
  );
}
