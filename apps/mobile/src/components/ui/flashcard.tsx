import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Check, RotateCw, X } from '@/components/icons';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

const FLIP_MS = 250;

type Props = {
  front: string;
  back: string;
  extra?: string | null;
  page?: number;
  flipped: boolean;
  onFlip: () => void;
  onPage?: (page: number) => void;
};

/** The flashcard (DESIGN.md §7, 25): one big ink touch target. A 250 ms Y-rotation flips it, or a
 * cross-fade under reduce motion. Front: the question; back: the answer, an extra line and the
 * page it comes from. */
export function Flashcard({ front, back, extra, page, flipped, onFlip, onPage }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    turn.set(withTiming(flipped ? 1 : 0, { duration: reduceMotion ? 150 : FLIP_MS }));
  }, [flipped, reduceMotion, turn]);

  const frontStyle = useAnimatedStyle(() => {
    const t = turn.get();
    return reduceMotion
      ? { opacity: 1 - t }
      : { opacity: t < 0.5 ? 1 : 0, transform: [{ perspective: 1200 }, { rotateY: `${interpolate(t, [0, 1], [0, 180])}deg` }] };
  });
  const backStyle = useAnimatedStyle(() => {
    const t = turn.get();
    return reduceMotion
      ? { opacity: t }
      : { opacity: t >= 0.5 ? 1 : 0, transform: [{ perspective: 1200 }, { rotateY: `${interpolate(t, [0, 1], [-180, 0])}deg` }] };
  });

  // The card body flips it; the page chip is its own button beside it, never inside (web forbids
  // a button in a button). Only the face showing is reachable by touch and TalkBack.
  const flip = (label: string, hint: string, children: ReactNode) => (
    <Pressable onPress={onFlip} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} style={styles.body}>
      {children}
    </Pressable>
  );
  const flipLabel = (text: string) => (
    <Pressable onPress={onFlip} accessibilityRole="button" accessibilityLabel={text} hitSlop={8} style={styles.flipLabel}>
      <RotateCw size={20} color={theme.mutedOnInk} />
      <Text variant="label" color="mutedOnInk">
        {text}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[styles.face, flipped ? styles.hidden : styles.shown, { backgroundColor: theme.text }, frontStyle]}
        pointerEvents={flipped ? 'none' : 'auto'}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        aria-hidden={flipped}>
        {flip(
          `Question: ${front}`,
          'Flip card to see the answer',
          <>
            <Text variant="caption" color="mutedOnInk" style={styles.caps}>
              QUESTION
            </Text>
            <View style={styles.middle}>
              <Text variant="title" color="onInk" style={styles.front}>
                {front}
              </Text>
            </View>
          </>,
        )}
        <View style={styles.foot}>{flipLabel('Tap to flip')}</View>
      </Animated.View>

      <Animated.View
        style={[styles.face, flipped ? styles.shown : styles.hidden, { backgroundColor: theme.text }, backStyle]}
        pointerEvents={flipped ? 'auto' : 'none'}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
        aria-hidden={!flipped}>
        {flip(
          `Answer: ${back}. ${extra ?? ''}`,
          'Flips the card back to the question',
          <>
            <Text variant="caption" color="mutedOnInk" style={styles.caps}>
              ANSWER
            </Text>
            <View style={styles.middle}>
              <Text variant="heading" color="onInk" style={styles.answer}>
                {back}
              </Text>
              {extra ? (
                <Text variant="body" color="mutedOnInk">
                  {extra}
                </Text>
              ) : null}
            </View>
          </>,
        )}
        <View style={styles.foot}>
          {page ? (
            <>
              <Pressable
                onPress={() => onPage?.(page)}
                accessibilityRole="button"
                accessibilityLabel={`Open page ${page} of your notes`}
                hitSlop={8}
                style={[styles.chip, { borderColor: theme.onInk }]}>
                <Text variant="label" color="onInk">
                  p. {page}
                </Text>
              </Pressable>
              <Text variant="small" color="mutedOnInk" style={styles.flex}>
                From your notes
              </Text>
            </>
          ) : (
            <View style={styles.flex} />
          )}
          {flipLabel('Flip back')}
        </View>
      </Animated.View>
    </View>
  );
}

type RatingProps = { value: boolean | undefined; onRate: (knew: boolean) => void };

/** "Didn't know" and "Knew it": self-rating, not marking, so the chosen one gets an ink border, no
 * red or green (DESIGN.md §7, 25). */
export function RatingPills({ value, onRate }: RatingProps) {
  const theme = useTheme();
  return (
    <View style={styles.ratings} accessibilityRole="radiogroup" accessibilityLabel="How did you do?">
      {[
        { knew: false, label: "Didn't know", icon: X },
        { knew: true, label: 'Knew it', icon: Check },
      ].map(({ knew, label, icon: Icon }) => {
        const chosen = value === knew;
        return (
          <Pressable
            key={label}
            onPress={() => onRate(knew)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: chosen }}
            style={({ pressed }) => [
              styles.rating,
              { backgroundColor: theme.backgroundSelected, borderColor: chosen ? theme.text : 'transparent', opacity: pressed ? 0.85 : 1 },
            ]}>
            <Icon size={22} color={theme.text} />
            <Text variant="label">{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  face: { minHeight: 360, borderRadius: Radius.hero, padding: Spacing.four, gap: Spacing.three, backfaceVisibility: 'hidden' },
  // The face showing sets the card's height, so long text at a large font size still fits.
  shown: { flexGrow: 1 },
  hidden: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  caps: { letterSpacing: 1.2 },
  body: { flex: 1, gap: Spacing.three },
  middle: { flex: 1, justifyContent: 'center', gap: Spacing.three },
  flipLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: Size.minTouch },
  front: { fontSize: 32, lineHeight: 38 },
  answer: { fontSize: 22, lineHeight: 30 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: Spacing.twoHalf, minHeight: 36, justifyContent: 'center' },
  flex: { flex: 1 },
  ratings: { flexDirection: 'row', gap: Spacing.twoHalf },
  rating: {
    flex: 1,
    minHeight: Size.minTouch + 8,
    borderRadius: Radius.full,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
