import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronRight, House, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Rays } from '@/components/ui/rays';
import { Text } from '@/components/ui/text';
import { Accent, type AccentName, Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccent } from '@/lib/appearance';
import { type Celebration, useCelebration } from '@/lib/celebrate';
import { friendlyError } from '@/lib/errors';

const RING = 168;
const RAYS = 236; // the rays sit just outside the ring

const COPY: Record<Celebration['kind'], { pill: string; title: string }> = {
  topic_mastered: { pill: 'New mastery', title: 'Topic mastered' },
  personal_best: { pill: 'Personal best', title: 'Personal best' },
  readiness_up: { pill: 'Readiness up', title: 'Readiness up' },
  weekly_goal: { pill: 'Weekly goal', title: 'Goal met' },
  theme_unlocked: { pill: 'New theme', title: 'Theme unlocked' },
};

const THEME_RULE: Record<AccentName, string> = {
  lagoon: 'Your 1st mastered topic',
  ankara: '10 topics mastered',
  palm: 'Weekly goal 4 weeks running',
  lavender: '3 friends joined Quizzly',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Bar({ label, value, tone }: { label: string; value: number; tone: 'text' | 'danger' | 'warning' }) {
  const theme = useTheme();
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${pct(value)}`}>
      <Text variant="body" color="textSecondary" style={styles.barLabel}>
        {label}
      </Text>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.fill, { backgroundColor: theme[tone], width: `${Math.max(value * 100, 3)}%` }]} />
      </View>
      <Text variant="label" color={tone} style={styles.barValue}>
        {pct(value)}
      </Text>
    </View>
  );
}

// Screen 16 (DESIGN.md §7, FR-HAB-05): one achievement, shown once per session. Ink top with the
// ring, then "since last Monday", the course readiness change and any theme it unlocked.
export default function CelebrateScreen() {
  const theme = useTheme();
  const accent = useAccent() ?? Accent.lagoon; // a celebration may use colour (§3.2)
  const { achievementId, theme: unlocked } = useLocalSearchParams<{ achievementId: string; theme?: string }>();
  const query = useCelebration(achievementId);
  const c = query.data;
  const newTheme = (c?.kind === 'theme_unlocked' ? c.ref.theme : unlocked) as AccentName | undefined;
  const copy = c ? COPY[c.kind] : null;

  useEffect(() => {
    if (c && Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [c]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const beforeTone = (v: number) => (v < 0.5 ? 'danger' : v < 0.8 ? 'warning' : 'text');

  return (
    <View style={[styles.root, { backgroundColor: theme.hdr }]}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.inner}>
        <View style={styles.top}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
          {copy ? (
            <View style={[styles.badge, { backgroundColor: accent }]}>
              {/* Text on an accent is always ink (DESIGN.md §3.2). */}
              <Text variant="label" style={{ color: Colors.light.text }}>
                {copy.pill}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.hero} accessible accessibilityLiveRegion="polite" accessibilityLabel={c && copy ? `${copy.title}. ${c.subtitle ?? ''}` : 'Loading'}>
          <View style={styles.rays}>
            {c ? <Rays size={RAYS} /> : null}
            <ProgressRing size={RING} strokeWidth={12} value={c?.ring ?? 0} label={c?.ring_label ?? '…'} color="onHdr" trackColor="hdrLine" />
          </View>
          <Text variant="display" color="onHdr" style={styles.center} accessibilityRole="header">
            {copy?.title ?? ' '}
          </Text>
          {c?.subtitle ? (
            <Text variant="body" color="mutedOnHdr" style={styles.center}>
              {c.subtitle}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>

      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={[styles.inner, styles.sheetBody]}>
          {query.isError ? <Banner message={friendlyError(query.error)} /> : null}
          {c && (c.now !== null || c.readiness) ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
              {c.now !== null ? (
                <>
                  <Text variant="label">Since last Monday</Text>
                  <Bar label="Before" value={c.before ?? 0} tone={beforeTone(c.before ?? 0)} />
                  <Bar label="Now" value={c.now} tone="text" />
                </>
              ) : null}
              {c.readiness ? (
                <Text variant="body" color="textSecondary">
                  {c.readiness.code} readiness{' '}
                  {c.readiness.before !== null ? `${pct(c.readiness.before)} → ${pct(c.readiness.now)}` : pct(c.readiness.now)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {newTheme && newTheme in Accent ? (
            <Pressable
              onPress={() => router.push('/settings/themes')}
              accessibilityRole="button"
              accessibilityLabel={`New theme unlocked: ${newTheme}. ${THEME_RULE[newTheme]}`}
              accessibilityHint="Opens themes"
              style={({ pressed }) => [styles.themeRow, { backgroundColor: theme.text, opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.swatch, { backgroundColor: theme.onInk }]}>
                <View style={[styles.half, { backgroundColor: Accent[newTheme] }]} />
              </View>
              <View style={styles.flex}>
                <Text variant="label" color="onInk">
                  New theme unlocked: {newTheme[0].toUpperCase() + newTheme.slice(1)}
                </Text>
                <Text variant="small" color="mutedOnInk">
                  {THEME_RULE[newTheme]}
                </Text>
              </View>
              <ChevronRight size={22} color={theme.onInk} />
            </Pressable>
          ) : null}

          <View style={styles.action}>
            <ActionPill label="Back to today" icon={House} onPress={() => router.dismissTo('/')} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter, gap: Spacing.three },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: 44, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.five },
  rays: { width: RAYS, height: RAYS, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  sheet: { flex: 1, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, overflow: 'hidden' },
  sheetBody: { paddingTop: Spacing.four, paddingBottom: Spacing.six, flexGrow: 1 },
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.twoHalf },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  barLabel: { width: 64 },
  track: { flex: 1, height: 12, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
  barValue: { minWidth: 48, textAlign: 'right' },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.twoHalf, paddingRight: Spacing.gutter, borderRadius: Radius.card },
  swatch: { width: 48, height: 48, borderRadius: Radius.full, overflow: 'hidden', flexDirection: 'row', justifyContent: 'flex-end' },
  half: { width: 24, height: 48 },
  flex: { flex: 1, gap: 2 },
  action: { marginTop: 'auto', paddingTop: Spacing.four },
});
