import { StyleSheet } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { useCalmMotion } from '@/lib/appearance';

/** Eight short rays around a celebration ring (screens 16, 23c); they fade in after it
 * (DESIGN.md §5: no confetti). `size` is the square they fill, just outside the ring. */
export function Rays({ size }: { size: number }) {
  const theme = useTheme();
  const calm = useCalmMotion();
  const c = size / 2;
  return (
    <Animated.View
      entering={calm ? undefined : FadeIn.delay(250).duration(500).reduceMotion(ReduceMotion.System)}
      style={StyleSheet.absoluteFill}
      pointerEvents="none">
      <Svg width={size} height={size}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const [r1, r2] = [c - 26, c - 8];
          return (
            <Line
              key={i}
              x1={c + r1 * Math.sin(a)}
              y1={c - r1 * Math.cos(a)}
              x2={c + r2 * Math.sin(a)}
              y2={c - r2 * Math.cos(a)}
              stroke={theme.mutedOnHdr}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
    </Animated.View>
  );
}
