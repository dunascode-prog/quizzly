import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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

import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccent } from '@/lib/appearance';

import { Text } from './text';

type Props = {
  size?: number;
  strokeWidth?: number;
  /** 0–1. Omit for an indeterminate spinner (used while an action is busy). */
  value?: number;
  /** Always shown inside determinate rings ("6/10", "45%"). */
  label?: string;
  color?: ThemeColor;
  /** A course accent (DESIGN.md §3.2) instead of a theme colour. */
  accent?: string;
  trackColor?: ThemeColor;
  /** Custom content in the middle instead of `label` (the label still names it for TalkBack). */
  children?: ReactNode;
};

export function ProgressRing({
  size = 56,
  strokeWidth = 4,
  value,
  label,
  color = 'onInk',
  accent,
  trackColor = 'track',
  children,
}: Props) {
  const theme = useTheme();
  const chosen = useAccent(); // the student's theme (FR-HAB-07)
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const indeterminate = value === undefined;
  const progress = indeterminate ? 0.28 : Math.min(Math.max(value, 0), 1);

  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (!indeterminate || reduceMotion) return;
    rotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1);
    return () => cancelAnimation(rotation);
  }, [indeterminate, reduceMotion, rotation]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View
      style={{ width: size, height: size }}
      accessible={!indeterminate}
      accessibilityRole={indeterminate ? undefined : 'progressbar'}
      accessibilityLabel={label}
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Animated.View style={[StyleSheet.absoluteFill, indeterminate && spin]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme[trackColor]} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={accent ?? (color === 'onInk' && chosen ? chosen : theme[color])}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </Animated.View>
      {children ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} importantForAccessibility="no-hide-descendants">
          {children}
        </View>
      ) : label ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text
            variant={size > 100 ? 'number' : 'caption'}
            color={color}
            style={size > 100 ? styles.bigLabel : styles.label}
            numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, lineHeight: 18 },
  bigLabel: { fontSize: 44, lineHeight: 48 },
});
