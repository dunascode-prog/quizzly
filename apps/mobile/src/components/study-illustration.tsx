import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/*
 * Built from assets/brand/study-illustration.svg (DESIGN.md §9). Each moving part is its own
 * full-size SVG layer inside an Animated.View: view transforms animate reliably on every
 * platform, whereas animating transforms inside one SVG does not.
 */

const W = 340;
const H = 230;
const ease = Easing.inOut(Easing.sin);

type Palette = { ink: string; paper: string; onInk: string; faint: string };

/** 0 → 1 → 0 forever; stays at 0 when reduce motion is on. */
function useOscillation(duration: number, delay: number, reduceMotion: boolean) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: duration / 2, easing: ease }), -1, true));
  }, [v, duration, delay, reduceMotion]);
  return v;
}

/** 0 → 1, then jumps back to 0 (rising steam). */
function useRise(duration: number, delay: number, reduceMotion: boolean) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1));
  }, [v, duration, delay, reduceMotion]);
  return v;
}

function Layer({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round">
        {children}
      </Svg>
    </Animated.View>
  );
}

/** `unit` is screen pixels per viewBox unit, so offsets scale with the illustration. */
function Float({ v, amp, unit, children }: {
  v: SharedValue<number>;
  amp: number;
  unit: SharedValue<number>;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -amp * v.value * unit.value }] }));
  return <Layer style={style}>{children}</Layer>;
}

function Sparkle({ d, x, y, delay, reduceMotion, color }: {
  d: string;
  x: number;
  y: number;
  delay: number;
  reduceMotion: boolean;
  color: string;
}) {
  const v = useOscillation(3000, delay, reduceMotion);
  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : 0.25 + 0.75 * v.value,
    transform: [{ scale: reduceMotion ? 1 : 0.7 + 0.3 * v.value }],
    transformOrigin: `${(x / W) * 100}% ${(y / H) * 100}%`,
  }));
  return (
    <Layer style={style}>
      <Path d={d} stroke={color} strokeWidth={2} />
    </Layer>
  );
}

export function StudyIllustration() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const unit = useSharedValue(1);
  const c: Palette = { ink: theme.text, paper: theme.backgroundSelected, onInk: theme.onInk, faint: theme.textSecondary };

  const page = useOscillation(4200, 0, reduceMotion);
  const cap = useOscillation(3600, 500, reduceMotion);
  const pencil = useOscillation(4600, 900, reduceMotion);
  const bulb = useOscillation(5000, 300, reduceMotion);
  const bubble = useOscillation(4000, 700, reduceMotion);
  const head = useOscillation(5000, 0, reduceMotion);
  const steam1 = useRise(2800, 0, reduceMotion);
  const steam2 = useRise(2800, 1400, reduceMotion);

  // "?" → ✓ → "?" every 6 s.
  const answer = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    answer.value = withRepeat(
      withSequence(
        withDelay(2400, withTiming(1, { duration: 600 })),
        withDelay(2400, withTiming(0, { duration: 600 })),
      ),
      -1,
    );
  }, [answer, reduceMotion]);

  const headStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-2 + 4 * head.value}deg` }],
    transformOrigin: `${(175 / W) * 100}% ${(110 / H) * 100}%`,
  }));
  const questionStyle = useAnimatedStyle(() => ({ opacity: 1 - answer.value }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: answer.value }));
  const steamStyle = (v: SharedValue<number>) => () => {
    'worklet';
    return reduceMotion
      ? { opacity: 0.8 }
      : { opacity: 1 - v.value, transform: [{ translateY: -10 * v.value * unit.value }] };
  };
  const steam1Style = useAnimatedStyle(steamStyle(steam1));
  const steam2Style = useAnimatedStyle(steamStyle(steam2));

  return (
    <View
      style={styles.frame}
      accessible
      accessibilityRole="image"
      accessibilityLabel="A student studying at a laptop"
      onLayout={(e) => {
        unit.value = e.nativeEvent.layout.width / W;
      }}>
      <Sparkle d="M150 12 V28 M142 20 H158" x={150} y={20} delay={0} reduceMotion={reduceMotion} color={c.faint} />
      <Sparkle d="M66 119 V133 M59 126 H73" x={66} y={126} delay={1000} reduceMotion={reduceMotion} color={c.ink} />
      <Sparkle d="M252 106 V118 M246 112 H258" x={252} y={112} delay={2000} reduceMotion={reduceMotion} color={c.faint} />

      <Float v={page} amp={6} unit={unit}>
        <G transform="rotate(-8 58 66)" stroke={c.ink}>
          <Rect x={36} y={40} width={44} height={54} rx={6} fill={c.paper} />
          <Path d="M45 54 H71 M45 63 H66" />
          <Path d="M47 76 L54 83 L68 70" strokeWidth={3} />
        </G>
      </Float>
      <Float v={cap} amp={7} unit={unit}>
        <G stroke={c.ink}>
          <Path d="M86 32 L112 20 L138 32 L112 44 Z" fill={c.ink} />
          <Path d="M98 38 V48 C106 54 118 54 126 48 V38" />
          <Path d="M112 32 L134 42 V54" />
          <Circle cx={134} cy={56} r={2.5} fill={c.ink} />
        </G>
      </Float>
      <Float v={pencil} amp={6} unit={unit}>
        <G transform="rotate(32 264 48)" stroke={c.ink}>
          <Rect x={236} y={42} width={48} height={12} rx={2} fill={c.paper} />
          <Path d="M284 42 L298 48 L284 54 Z" fill={c.paper} />
          <Rect x={236} y={42} width={9} height={12} rx={2} fill={c.ink} />
        </G>
      </Float>
      <Float v={bulb} amp={7} unit={unit}>
        <G stroke={c.ink}>
          <Circle cx={304} cy={96} r={14} fill={c.paper} />
          <Path d="M298 112 H310 M299 117 H309" />
          <Path d="M304 74 V68 M288 82 L284 78 M320 82 L324 78" strokeWidth={2} />
        </G>
      </Float>

      <Layer style={headStyle}>
        <G stroke={c.ink}>
          <Path d="M120 126 C126 108 146 102 160 102 H190 C204 102 224 108 230 126" fill={c.paper} />
          <Path d="M165 102 L175 113 L185 102" />
          <Circle cx={149} cy={82} r={5} fill={c.paper} />
          <Circle cx={201} cy={82} r={5} fill={c.paper} />
          <Circle cx={175} cy={80} r={26} fill={c.paper} />
          <Path
            d="M149 78 C146 52 166 41 181 45 C200 47 207 63 201 79 C197 68 187 62 175 64 C163 62 153 68 149 78 Z"
            fill={c.ink}
          />
          <Circle cx={166} cy={84} r={7} />
          <Circle cx={185} cy={84} r={7} />
          <Path d="M173 84 H178" />
          <Path d="M169 95 Q175 100 181 95" />
        </G>
      </Layer>

      <Float v={bubble} amp={6} unit={unit}>
        <Path
          d="M212 58 C212 46 222 40 232 40 C244 40 252 47 252 57 C252 67 244 74 232 74 L224 74 L215 81 L217 71 C214 68 212 63 212 58 Z"
          fill={c.ink}
          stroke={c.ink}
        />
      </Float>
      <Animated.View style={[StyleSheet.absoluteFill, questionStyle]} pointerEvents="none">
        <Float v={bubble} amp={6} unit={unit}>
          <SvgText x={232} y={64} textAnchor="middle" fontFamily={FontFamily.semibold} fontSize={20} fill={c.onInk}>
            ?
          </SvgText>
        </Float>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, tickStyle]} pointerEvents="none">
        <Float v={bubble} amp={6} unit={unit}>
          <Path d="M224 57 L230 63 L241 51" stroke={c.onInk} strokeWidth={3} />
        </Float>
      </Animated.View>

      <Layer>
        <G stroke={c.ink}>
          <Rect x={110} y={122} width={130} height={78} rx={8} fill={c.ink} />
          <G transform="translate(161 146) scale(0.3)" stroke={c.paper} strokeWidth={12}>
            <Circle cx={44} cy={44} r={30} />
            <Path d="M60 72 L72 84 L94 60" />
          </G>
          <Rect x={96} y={197} width={158} height={6} rx={3} fill={c.ink} />
          <Rect x={36} y={168} width={30} height={32} rx={6} fill={c.paper} />
          <Path d="M66 176 C76 176 76 192 66 192" />
          <Rect x={262} y={182} width={58} height={18} rx={3} fill={c.ink} />
          <Rect x={266} y={164} width={50} height={18} rx={3} fill={c.paper} />
          <Path d="M272 170 H304" strokeWidth={2} />
          <Rect x={270} y={148} width={44} height={16} rx={3} fill={c.ink} />
          <Path d="M14 203 H326" />
        </G>
      </Layer>
      <Layer style={steam1Style}>
        <Path d="M44 160 C40 154 48 150 44 144" stroke={c.faint} strokeWidth={2} />
      </Layer>
      <Layer style={steam2Style}>
        <Path d="M56 160 C52 154 60 150 56 144" stroke={c.faint} strokeWidth={2} />
      </Layer>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: W / H,
    alignSelf: 'center',
  },
});
