import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { X } from '@/components/icons';
import { initials } from '@/components/profile-header';
import { Accent, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccent, useCalmMotion } from '@/lib/appearance';
import { openTarget, useToast } from '@/lib/notifications';

import { IconButton } from './icon-button';
import { Pill } from './pill';
import { Text } from './text';

const SHOW_FOR = 6000;
const SLIDE_MS = 250;

/** The live notification (DESIGN.md §6, FR-NOTIF-02): an ink card at the top that slides down,
 * hides after 6 s, can be swiped up, and opens its target on "View". */
export function Toast() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useCalmMotion();
  const { current: n, hide } = useToast();
  const dot = useAccent() ?? Accent.lagoon;
  const y = useSharedValue(-200);

  useEffect(() => {
    if (!n) return;
    y.set(reduceMotion ? 0 : withTiming(0, { duration: SLIDE_MS }));
    const t = setTimeout(hide, SHOW_FOR);
    return () => clearTimeout(t);
  }, [n, hide, reduceMotion, y]);

  const swipeUp = Gesture.Pan().onEnd((e) => {
    if (e.translationY < -20) runOnJS(hide)();
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  if (!n) return null;
  const who = n.actor_name ?? n.title.split(' ').slice(0, 2).join(' ');
  return (
    <GestureDetector gesture={swipeUp}>
      <Animated.View
        style={[styles.wrap, { top: insets.top + Spacing.two }, style]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${n.title}. ${n.body ?? ''}`}>
        <View style={[styles.card, { backgroundColor: theme.text }]}>
          <View style={[styles.avatar, { backgroundColor: theme.inkRaised }]}>
            <Text variant="label" color="onInk">
              {initials(who)}
            </Text>
          </View>
          <View style={styles.text}>
            <Text variant="label" color="onInk" numberOfLines={2}>
              {n.title}
            </Text>
            <View style={styles.meta}>
              {/* The live dot is one of the places an accent may appear (DESIGN.md §3.2). */}
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <Text variant="small" color="mutedOnInk" numberOfLines={2} style={styles.flex}>
                Just now{n.body ? ` · ${n.body}` : ''}
              </Text>
            </View>
          </View>
          <Pill
            label="View"
            onPress={() => {
              hide();
              void openTarget(n);
            }}
          />
          <IconButton icon={X} tone="ink" accessibilityLabel="Dismiss" onPress={hide} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.three, zIndex: 100 },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderRadius: 24,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1 },
});
