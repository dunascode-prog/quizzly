import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { LucideIcon } from '@/components/icons';
import { FontFamily, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  label: string;
  /** An icon, or a short glyph such as "p." */
  icon: LucideIcon | string;
  tone?: 'field' | 'ink';
  /** Fixed tilt in degrees. */
  tilt?: number;
  /** Pop-in delay; also offsets the bob so stickers don't move together. */
  delay?: number;
  style?: ViewStyle;
};

const BOB_MS = 3600;
const ease = Easing.inOut(Easing.sin);

/**
 * Small tilted label around the welcome illustration (DESIGN.md §6, 01). Pops in, then bobs ±6;
 * still when reduce motion is on. Decorative: the illustration area carries the description.
 */
export function Sticker({ label, icon: Icon, tone = 'field', tilt = 0, delay = 0, style }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.6);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withDelay(
      delay,
      withSequence(withTiming(1.06, { duration: 300 }), withTiming(1, { duration: 200 })),
    );
    bob.value = withDelay(delay + 500, withRepeat(withTiming(1, { duration: BOB_MS / 2, easing: ease }), -1, true));
  }, [scale, bob, delay, reduceMotion]);

  const motion = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : Math.min(1, (scale.value - 0.6) / 0.3),
    transform: [{ translateY: -6 + bob.value * 12 }, { rotate: `${tilt}deg` }, { scale: scale.value }],
  }));

  const ink = tone === 'ink';
  const fill = ink ? theme.text : theme.backgroundSelected;
  const circle = ink ? theme.backgroundSelected : theme.text;
  const mark = ink ? theme.text : theme.onInk;

  return (
    <Animated.View
      style={[styles.sticker, { backgroundColor: fill, borderColor: theme.text }, motion, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.circle, { backgroundColor: circle }]}>
        {typeof Icon === 'string' ? (
          <Text variant="caption" style={[styles.glyph, { color: mark }]}>
            {Icon}
          </Text>
        ) : (
          <Icon size={14} color={mark} strokeWidth={2.5} />
        )}
      </View>
      <Text variant="caption" color={ink ? 'onInk' : 'text'} style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    position: 'absolute',
    height: Size.sticker,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: 4,
    paddingRight: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 11, lineHeight: 14 },
  label: { fontFamily: FontFamily.bold, fontSize: 13, lineHeight: 16 },
});
