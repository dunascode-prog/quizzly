import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Check, Plus, RotateCcw } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Text } from '@/components/ui/text';
import { Colors, MaxContentWidth, Radius, Size, Spacing } from '@/constants/theme';
import { useCalmMotion } from '@/lib/appearance';
import { makeAvatar, type Picked, rotateLeft, saveAvatar } from '@/lib/avatar';
import { friendlyError } from '@/lib/errors';

// The viewer is always dark, like the page viewer (29), whatever the app theme.
const DARK = Colors.dark;
const MAX_ZOOM = 4;
const CIRCLE_INSET = Spacing.three;
const THUMB = 28;

/** Keeps the photo covering the circle: how far it may move from the centre at this zoom. */
function limit(imageSide: number, zoom: number, circle: number) {
  'worklet';
  return Math.max(0, (imageSide * zoom - circle) / 2);
}

function clamp(v: number, lo: number, hi: number) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

// 02c Move and scale (PROFILE_V2.md §3, FR-PROF-04): our own circle crop. Drag to move, pinch or
// the slider to zoom, rotate a quarter turn; "Use photo" makes the 512×512 WebP and sends it.
export default function CropScreen() {
  const params = useLocalSearchParams<{ uri: string; width: string; height: string }>();
  const calm = useCalmMotion();
  const window = useWindowDimensions();
  const [photo, setPhoto] = useState<Picked>({
    uri: params.uri,
    width: Number(params.width) || 1,
    height: Number(params.height) || 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState(0);
  const [percent, setPercent] = useState(0); // read out by screen readers

  // The square viewport and the circle inside it.
  const view = Math.min(window.width - 2 * Spacing.gutter, MaxContentWidth, window.height * 0.5);
  const circle = view - 2 * CIRCLE_INSET;
  // At zoom 1 the photo's short side fills the viewport.
  const base = view / Math.min(photo.width, photo.height);
  const shownW = photo.width * base;
  const shownH = photo.height * base;

  const zoom = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ zoom: 1, x: 0, y: 0 });

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const reset = () => {
    zoom.set(1);
    x.set(0);
    y.set(0);
  };

  const setZoom = (next: number) => {
    const z = clamp(next, 1, MAX_ZOOM);
    const lx = limit(shownW, z, circle);
    const ly = limit(shownH, z, circle);
    zoom.set(calm ? z : withTiming(z, { duration: 180 }));
    x.set(clamp(x.get(), -lx, lx));
    y.set(clamp(y.get(), -ly, ly));
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      start.set({ zoom: zoom.get(), x: x.get(), y: y.get() });
    })
    .onUpdate((e) => {
      const z = zoom.get();
      const lx = limit(shownW, z, circle);
      const ly = limit(shownH, z, circle);
      x.set(clamp(start.get().x + e.translationX, -lx, lx));
      y.set(clamp(start.get().y + e.translationY, -ly, ly));
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.set({ zoom: zoom.get(), x: x.get(), y: y.get() });
    })
    .onUpdate((e) => {
      const z = clamp(start.get().zoom * e.scale, 1, MAX_ZOOM);
      const lx = limit(shownW, z, circle);
      const ly = limit(shownH, z, circle);
      zoom.set(z);
      x.set(clamp(x.get(), -lx, lx));
      y.set(clamp(y.get(), -ly, ly));
    });
  const slide = Gesture.Pan()
    .minDistance(0)
    .onUpdate((e) => {
      if (track <= 0) return;
      const z = clamp(1 + ((e.x - THUMB / 2) / (track - THUMB)) * (MAX_ZOOM - 1), 1, MAX_ZOOM);
      const lx = limit(shownW, z, circle);
      const ly = limit(shownH, z, circle);
      zoom.set(z);
      x.set(clamp(x.get(), -lx, lx));
      y.set(clamp(y.get(), -ly, ly));
    });

  useAnimatedReaction(
    () => Math.round(((zoom.get() - 1) / (MAX_ZOOM - 1)) * 100),
    (now, before) => {
      if (now !== before) runOnJS(setPercent)(now);
    },
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }],
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ((zoom.get() - 1) / (MAX_ZOOM - 1)) * Math.max(0, track - THUMB) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: THUMB / 2 + ((zoom.get() - 1) / (MAX_ZOOM - 1)) * Math.max(0, track - THUMB),
  }));

  const rotate = async () => {
    setError(null);
    try {
      setPhoto(await rotateLeft(photo));
      reset();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      // The viewport's centre and the circle, in the photo's own pixels.
      const scale = base * zoom.get();
      const side = Math.min(circle / scale, photo.width, photo.height);
      const cx = photo.width / 2 - x.get() / scale;
      const cy = photo.height / 2 - y.get() / scale;
      const uri = await makeAvatar(photo, {
        originX: Math.round(clamp(cx - side / 2, 0, photo.width - side)),
        originY: Math.round(clamp(cy - side / 2, 0, photo.height - side)),
        width: Math.floor(side),
        height: Math.floor(side),
      });
      await saveAvatar(uri);
      close();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };


  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: DARK.background }]}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}>
            <Text variant="label" style={{ color: DARK.text }}>
              Cancel
            </Text>
          </Pressable>
          <Text variant="label" accessibilityRole="header" style={[styles.title, { color: DARK.text }]}>
            Move and scale
          </Text>
          <Pressable
            onPress={() => void rotate()}
            accessibilityRole="button"
            accessibilityLabel="Rotate left"
            style={({ pressed }) => [styles.round, { backgroundColor: DARK.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
            <RotateCcw size={22} color={DARK.text} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.stage}>
          <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
            <View
              style={[styles.viewport, { width: view, height: view }]}
              accessible
              accessibilityLabel="Your photo. Drag to move. Pinch or use the slider to zoom.">
              <Animated.View
                style={[
                  { position: 'absolute', width: shownW, height: shownH, left: (view - shownW) / 2, top: (view - shownH) / 2 },
                  imageStyle,
                ]}>
                <Image
                  source={{ uri: photo.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="fill"
                  // The picker's size can disagree with the decoded image (e.g. EXIF rotation); the crop
                  // must use the image as it's drawn.
                  onLoad={({ source }) => {
                    if (source.width && (source.width !== photo.width || source.height !== photo.height)) {
                      setPhoto((p) => ({ ...p, width: source.width, height: source.height }));
                      reset();
                    }
                  }}
                />
              </Animated.View>
              <CircleMask view={view} circle={circle} />
            </View>
          </GestureDetector>
        </View>

        <View style={styles.bottom}>
          <View style={styles.zoomRow}>
            <Text variant="body" style={{ color: DARK.textSecondary }}>
              Zoom
            </Text>
            <GestureDetector gesture={slide}>
              <View
                style={styles.track}
                onLayout={(e: LayoutChangeEvent) => setTrack(e.nativeEvent.layout.width)}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Zoom"
                accessibilityValue={{ text: `${percent}%` }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) => setZoom(zoom.get() + (e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5))}>
                <View style={[styles.rail, { backgroundColor: DARK.hdrLine }]} />
                <Animated.View style={[styles.rail, styles.fill, { backgroundColor: DARK.text }, fillStyle]} />
                <Animated.View style={[styles.thumb, { backgroundColor: DARK.text }, thumbStyle]} />
              </View>
            </GestureDetector>
            <Pressable
              onPress={() => setZoom(zoom.get() + 0.5)}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              style={({ pressed }) => [styles.round, { backgroundColor: DARK.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
              <Plus size={22} color={DARK.text} strokeWidth={2} />
            </Pressable>
          </View>
          <Text variant="small" style={[styles.hint, { color: DARK.textSecondary }]}>
            Drag to move. Pinch or use the slider to zoom.
          </Text>
          {error ? <Banner message={error} /> : null}
          <ActionPill label="Use photo" icon={Check} variant="light" onPress={() => void use()} loading={busy} />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

/** White circle with a rule-of-thirds grid; the corners outside it are dimmed. */
function CircleMask({ view, circle }: { view: number; circle: number }) {
  // A thick round border dims everything outside the circle.
  const outer = Math.ceil(view * 1.5);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: 'absolute',
          width: circle + 2 * outer,
          height: circle + 2 * outer,
          left: CIRCLE_INSET - outer,
          top: CIRCLE_INSET - outer,
          borderRadius: Radius.full,
          borderWidth: outer,
          borderColor: DARK.scrim,
        }}
      />
      <View
        style={[
          styles.circle,
          { width: circle, height: circle, left: CIRCLE_INSET, top: CIRCLE_INSET, borderColor: DARK.text },
        ]}>
        {[1, 2].map((i) => (
          <View key={`v${i}`} style={[styles.gridV, { left: (circle / 3) * i, backgroundColor: DARK.text }]} />
        ))}
        {[1, 2].map((i) => (
          <View key={`h${i}`} style={[styles.gridH, { top: (circle / 3) * i, backgroundColor: DARK.text }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  cancel: { minHeight: Size.minTouch, justifyContent: 'center', paddingRight: Spacing.two },
  title: { flex: 1, textAlign: 'center', fontSize: 18 },
  round: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewport: { overflow: 'hidden', borderRadius: Radius.gridCell * 2 },
  circle: { position: 'absolute', borderRadius: Radius.full, borderWidth: 2, overflow: 'hidden' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, opacity: 0.6 },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.6 },
  bottom: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  track: { flex: 1, height: Size.minTouch, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: Radius.full },
  fill: { right: undefined },
  thumb: { position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: Radius.full },
  hint: { textAlign: 'center' },
});
