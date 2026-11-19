import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, ChevronRight, Hand, LayoutGrid, X } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { Colors, MaxContentWidth, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deviceStore } from '@/lib/device-store';
import { friendlyError } from '@/lib/errors';
import { useOutline, usePage, usePageImage } from '@/lib/study';

const HINT_KEY = 'hint.page-zoom.v1';
const MAX_ZOOM = 4;

/** Width ÷ height of the image, once known. 0 when it couldn't be loaded. */
function useAspect(url: string | null | undefined) {
  const [aspect, setAspect] = useState<{ url: string; ratio: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    Image.getSize(
      url,
      (w, h) => live && h > 0 && setAspect({ url, ratio: w / h }),
      () => live && setAspect({ url, ratio: 0 }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return url && aspect?.url === url ? aspect.ratio : null;
}

/** The page as large as fits, with pinch to zoom, pan while zoomed, double-tap to fit, and a
 * left/right swipe to turn the page when it isn't zoomed. */
function ZoomablePage({
  url,
  ratio,
  label,
  onSwipe,
}: {
  url: string;
  ratio: number;
  label: string;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const theme = useTheme();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Reset when the page changes.
  useEffect(() => {
    scale.set(1);
    saved.set(1);
    x.set(0);
    y.set(0);
  }, [url, scale, saved, x, y]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.min(MAX_ZOOM, Math.max(1, saved.get() * e.scale)));
    })
    .onEnd(() => {
      saved.set(scale.get());
      if (scale.get() === 1) {
        x.set(0);
        y.set(0);
      }
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((e) => {
      if (scale.get() > 1) {
        x.set(startX.get() + e.translationX);
        y.set(startY.get() + e.translationY);
      }
    })
    .onEnd((e) => {
      if (scale.get() === 1 && Math.abs(e.translationX) > 60 && Math.abs(e.translationY) < 80) {
        runOnJS(onSwipe)(e.translationX < 0 ? 1 : -1);
      }
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.get() > 1;
      scale.set(withTiming(zoomed ? 1 : 2));
      saved.set(zoomed ? 1 : 2);
      x.set(withTiming(0));
      y.set(withTiming(0));
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  // Fit the page inside the area (less its side gutters), keeping its shape.
  const fitWidth = Math.max(0, Math.min(box.width - Spacing.gutter * 2, box.height * ratio));
  const size = { width: fitWidth, height: ratio ? fitWidth / ratio : 0 };

  return (
    <View style={styles.zoomArea} onLayout={(e) => setBox(e.nativeEvent.layout)}>
      <GestureDetector gesture={Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan))}>
        <Animated.View style={[styles.pageCard, size, { borderColor: theme.line }, style]}>
          {/* The page itself stays white in dark mode too (DESIGN.md §3.3). */}
          <Image
            source={{ uri: url }}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** "Pinch to zoom · double-tap to fit": shown once, pulses three times, then hides. */
function ZoomHint() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [show, setShow] = useState(false);
  const opacity = useSharedValue(1);

  useEffect(() => {
    let live = true;
    Promise.resolve(deviceStore.getItem(HINT_KEY))
      .then((seen) => {
        if (!live || seen) return;
        setShow(true);
        void deviceStore.setItem(HINT_KEY, '1');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    if (!reduceMotion) {
      opacity.set(
        withRepeat(withSequence(withTiming(0.55, { duration: 500 }), withTiming(1, { duration: 500 })), 3),
      );
    }
    const t = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(t);
  }, [show, reduceMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  if (!show) return null;
  return (
    <Animated.View
      style={[styles.hint, { backgroundColor: theme.text }, style]}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Pinch to zoom, double-tap to fit">
      <View style={[styles.hintIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Hand size={18} color={theme.text} />
      </View>
      <Text variant="label" color="onInk">
        Pinch to zoom · double-tap to fit
      </Text>
    </Animated.View>
  );
}

function PageGrid({
  count,
  current,
  onPick,
  onClose,
}: {
  count: number;
  current: number;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={onClose} accessible={false} />
      <View style={[styles.gridSheet, { backgroundColor: theme.background }]}>
        <View style={styles.gridHeader}>
          <Text variant="title" accessibilityRole="header">
            All pages
          </Text>
          <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
            const selected = n === current;
            return (
              <Pressable
                key={n}
                onPress={() => onPick(n)}
                accessibilityRole="button"
                accessibilityLabel={`Page ${n}`}
                accessibilityState={{ selected }}
                style={[styles.gridCell, { backgroundColor: selected ? theme.text : theme.backgroundSelected }]}>
                <Text variant="label" color={selected ? 'onInk' : 'text'}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// Screen 29 (DESIGN.md §7, FR-DOC-10): the original page, opened from a citation chip on the
// student's own notes. Slides, or no connection, show the page text instead. In a course shared
// with the student the API gives only a quoted passage (FR-SHARE-02).
export default function PageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, n } = useLocalSearchParams<{ id: string; n: string }>();
  const number = Number(n) || 1;
  const [cited] = useState(number); // the page the citation pointed at
  const [grid, setGrid] = useState(false);
  const page = usePage(id, number);
  const image = usePageImage(id, number);
  const title = useOutline(id).data?.document.title;
  const url = image.data?.url;
  const ratio = useAspect(url);
  const hasImage = !!url && !image.isError && ratio !== 0;
  const waiting = image.isLoading || (hasImage && !ratio); // not while skipped in low-data mode
  const count = page.data?.page_count ?? null;
  const quote = Boolean((page.data as { quote?: boolean } | undefined)?.quote);

  const go = (to: number) => {
    if (to < 1 || (count !== null && to > count)) return;
    router.setParams({ n: String(to) });
  };
  const label = `Page ${number}${count ? ` of ${count}` : ''}`;
  const pageText = page.data?.text ?? '';

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.header}>
          <IconButton icon={ChevronLeft} accessibilityLabel="Back to explanation" onPress={() => router.back()} />
          <View style={styles.titles}>
            <Text variant="heading" accessibilityRole="header" numberOfLines={1}>
              {label}
            </Text>
            {title ? (
              <Text variant="small" color="textSecondary" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          {count ? (
            <IconButton icon={LayoutGrid} accessibilityLabel="All pages" onPress={() => setGrid(true)} />
          ) : (
            <View style={styles.spacer} />
          )}
        </View>

        {page.isError ? (
          <View style={styles.padded}>
            <Banner message={friendlyError(page.error)} />
          </View>
        ) : null}

        {hasImage && ratio ? (
          <>
            <ZoomablePage
              url={url}
              ratio={ratio}
              label={`${label} of your notes. ${pageText.slice(0, 1000)}`}
              onSwipe={(dir) => go(number + dir)}
            />
            <ZoomHint />
          </>
        ) : waiting ? (
          <View style={[styles.padded, styles.flex]}>
            <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.padded, styles.textBody]}>
            {quote ? (
              <Text variant="caption" color="textSecondary">
                QUOTED FROM THE SHARED NOTES · P. {number}
              </Text>
            ) : null}
            <View style={[styles.textCard, { backgroundColor: theme.backgroundSelected }]}>
              <Text variant="reading" selectable>
                {page.isPending ? ' ' : pageText || 'This page has no text.'}
              </Text>
            </View>
          </ScrollView>
        )}

        {/* Floating ink bar (68): previous / next and where you are (DESIGN.md §7, 29). */}
        <View style={[styles.barWrap, { bottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}>
          <View style={[styles.bar, { backgroundColor: theme.text }]}>
            <Pressable
              onPress={() => go(number - 1)}
              disabled={number <= 1}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              accessibilityState={{ disabled: number <= 1 }}
              style={[styles.barButton, { backgroundColor: theme.backgroundSelected, opacity: number <= 1 ? 0.4 : 1 }]}>
              <ChevronLeft size={24} color={theme.text} />
            </Pressable>
            <View style={styles.barMiddle} accessible accessibilityLabel={`${label}${number === cited ? ', the cited page' : ''}`}>
              <Text variant="label" color="onInk" numberOfLines={1}>
                {count ? `${number} / ${count}` : `Page ${number}`}
                {number === cited ? ' · Cited page' : ''}
              </Text>
              {count ? (
                <View style={[styles.progressTrack, { backgroundColor: theme.track }]}>
                  <View style={[styles.progressFill, { backgroundColor: theme.onInk, width: `${(number / count) * 100}%` }]} />
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => go(number + 1)}
              disabled={count !== null && number >= count}
              accessibilityRole="button"
              accessibilityLabel="Next page"
              accessibilityState={{ disabled: count !== null && number >= count }}
              style={[
                styles.barButton,
                { backgroundColor: theme.backgroundSelected, opacity: count !== null && number >= count ? 0.4 : 1 },
              ]}>
              <ChevronRight size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {grid && count ? (
        <PageGrid
          count={count}
          current={number}
          onClose={() => setGrid(false)}
          onPick={(to) => {
            setGrid(false);
            go(to);
          }}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  titles: { flex: 1, alignItems: 'center' },
  spacer: { width: Size.iconButton },
  padded: { paddingHorizontal: Spacing.gutter, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  zoomArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.gutter,
    marginBottom: Size.tabBar + Spacing.five,
    overflow: 'hidden',
  },
  // The page stays white in dark mode too (DESIGN.md §3.3).
  pageCard: { backgroundColor: Colors.light.onInk, borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Size.tabBar + Spacing.six + Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: 6,
    paddingRight: Spacing.three,
    minHeight: Size.pill,
    borderRadius: Radius.full,
  },
  hintIcon: { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  skeleton: { flex: 1, borderRadius: Radius.card, marginBottom: Size.tabBar + Spacing.five },
  textBody: { gap: Spacing.two, paddingBottom: Size.tabBar + Spacing.six },
  textCard: { borderRadius: Radius.card, padding: Spacing.gutter },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.gutter },
  bar: {
    width: '100%',
    maxWidth: MaxContentWidth - Spacing.gutter * 2,
    minHeight: Size.tabBar,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    padding: (Size.tabBar - Size.iconButton) / 2,
  },
  barButton: { width: Size.iconButton, height: Size.iconButton, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  barMiddle: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: Spacing.two },
  progressTrack: { width: '80%', height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  gridSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: Spacing.gutter,
    gap: Spacing.three,
  },
  gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingBottom: Spacing.six },
  gridCell: { width: 60, height: 72, borderRadius: Radius.option, alignItems: 'center', justifyContent: 'center' },
});
