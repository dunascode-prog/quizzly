import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Logo } from '@/components/logo';
import { Accent, Colors, Radius, Spacing } from '@/constants/theme';
import type { Recap } from '@/lib/recap';

import { Text } from './text';

// The recap image always uses the light palette, so it looks the same on WhatsApp whatever the
// phone's theme (DESIGN.md §3.3).
const L = Colors.light;
// It's an image: the type grows a little with the phone's font size but the layout stays fixed.
const SCALE = 1.3;

function Pie({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const c = size / 2;
  const v = Math.min(Math.max(value, 0), 1);
  const a = 2 * Math.PI * v;
  const x = c + c * Math.sin(a);
  const y = c - c * Math.cos(a);
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={c} fill={L.track} />
      {v >= 1 ? (
        <Circle cx={c} cy={c} r={c} fill={color} />
      ) : v > 0 ? (
        <Path d={`M${c} ${c} L${c} 0 A${c} ${c} 0 ${v > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} fill={color} />
      ) : null}
    </Svg>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.tile, styles.flex]}>
      <Text variant="small" style={{ color: L.mutedOnInk }} maxFontSizeMultiplier={SCALE}>
        {label}
      </Text>
      <Text variant="title" style={{ color: L.onInk }} maxFontSizeMultiplier={SCALE}>
        {value}
      </Text>
    </View>
  );
}

type Props = { recap: Recap; showIdentity: boolean; link: string | null };

/** RecapCard (DESIGN.md §6, screen 17): the ink card captured as a 9:16 image when shared. */
export const RecapCard = forwardRef<View, Props>(function RecapCard({ recap, showIdentity, link }, ref) {
  const who = [recap.name, [recap.institution, recap.level].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
  const r = recap.readiness;
  const ringColor = r ? Accent[r.accent] : Accent.lagoon;
  const change = r?.change ? Math.round(r.change * 100) : 0;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { backgroundColor: L.text }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`This week I answered ${recap.questions_answered} practice questions. Topics mastered ${recap.topics_mastered}. Study days ${recap.study_days} of ${recap.goal}.${r ? ` ${r.code} exam readiness ${Math.round(r.value * 100)} percent.` : ''}`}>
      <View style={styles.head}>
        <Logo size={36} color={L.onInk} />
        {showIdentity && who ? (
          <Text variant="small" style={[styles.who, { color: L.mutedOnInk }]} numberOfLines={1} maxFontSizeMultiplier={SCALE}>
            {who}
          </Text>
        ) : null}
      </View>

      <View style={styles.big}>
        <Text variant="body" style={{ color: L.mutedOnInk }} maxFontSizeMultiplier={SCALE}>
          This week I answered
        </Text>
        <Text variant="number" style={[styles.number, { color: L.onInk }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1}>
          {recap.questions_answered}
        </Text>
        <Text variant="title" style={{ color: L.onInk }} maxFontSizeMultiplier={SCALE}>
          practice question{recap.questions_answered === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.tiles}>
        <View style={styles.row}>
          <Tile label="Topics mastered" value={String(recap.topics_mastered)} />
          <Tile label="Study days" value={`${recap.study_days}/${recap.goal}`} />
        </View>
        {r ? (
          <View style={[styles.tile, styles.readiness]}>
            <View style={styles.flex}>
              <Text variant="small" style={{ color: L.mutedOnInk }} numberOfLines={1} maxFontSizeMultiplier={SCALE}>
                {r.code} exam readiness
              </Text>
              <Text variant="title" style={{ color: L.onInk }} maxFontSizeMultiplier={SCALE}>
                {Math.round(r.value * 100)}%{' '}
                {change > 0 ? (
                  <Text variant="label" style={{ color: ringColor }} maxFontSizeMultiplier={SCALE}>
                    +{change}%
                  </Text>
                ) : null}
              </Text>
            </View>
            <Pie value={r.value} color={ringColor} />
          </View>
        ) : null}
      </View>

      <Text variant="small" style={{ color: L.mutedOnInk }} numberOfLines={1} maxFontSizeMultiplier={SCALE}>
        Study smarter with Quizzly{link ? ` · ${link.replace(/^https?:\/\//, '')}` : ''}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 9 / 16, borderRadius: Radius.hero, padding: Spacing.four, justifyContent: 'space-between', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  who: { flexShrink: 1, textAlign: 'right' },
  big: { gap: Spacing.one },
  number: { fontSize: 104, lineHeight: 108, letterSpacing: -3 },
  tiles: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  tile: { backgroundColor: L.inkRaised, borderRadius: Radius.tile, padding: Spacing.three, gap: Spacing.one },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
});
