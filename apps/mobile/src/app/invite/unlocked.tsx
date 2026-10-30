import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArrowRight, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { HeroCard } from '@/components/ui/hero-card';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Rays } from '@/components/ui/rays';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Accent, Colors, MaxContentWidth, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dollars, price, useInvite, usePlans, useRewardSeen } from '@/lib/plans';
import { useMe } from '@/lib/profile';

const RING = 168;
const RAYS = 236;

// 23c Discount unlocked (DESIGN.md §7, FR-INV-05): shown once when the 5th credit counts. A
// celebration may use the accent (§3.2). Calm copy: no countdown, no urgency.
export default function DiscountUnlocked() {
  const theme = useTheme();
  const invite = useInvite().data;
  const plans = usePlans().data;
  const country = useMe().data?.country;
  const seen = useRewardSeen();
  const percent = invite?.discount.percent ?? 10;
  const at = invite?.discount.at ?? 5;

  // Seen once it's on screen, so it never comes back (FR-INV-05).
  const marked = useRef(false);
  useEffect(() => {
    if (!marked.current) {
      marked.current = true;
      seen.mutate();
    }
  }, [seen]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const rows = (['student', 'premium'] as const).map((id) => {
    const p = plans?.plans.find((x) => x.id === id);
    const full = p?.price_usd ?? (id === 'student' ? 6 : 10);
    const cut = p?.discounted_price_usd ?? Math.round(full * (100 - percent)) / 100;
    return { id, name: id === 'student' ? 'Student' : 'Premium', full, cut };
  });

  return (
    <View style={[styles.root, { backgroundColor: theme.hdr }]}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.inner}>
        <View style={styles.top}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
          <View style={[styles.pill, { backgroundColor: Accent.lavender }]}>
            {/* Text on an accent is always ink (DESIGN.md §3.2). */}
            <Text variant="label" style={{ color: Colors.light.text }}>
              Invite reward
            </Text>
          </View>
        </View>
        <View style={styles.hero} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${percent}% off. ${at} friends are studying with Quizzly because of you.`}>
          <View style={styles.rays}>
            <Rays size={RAYS} />
            <ProgressRing size={RING} strokeWidth={12} value={1} accent={Accent.lavender} trackColor="hdrLine" label={`${at} credits`}>
              <View style={styles.centre}>
                <Text style={[Type.number, { color: theme.onHdr }]} maxFontSizeMultiplier={1.3}>
                  {at}
                </Text>
                <Text variant="small" color="mutedOnHdr" maxFontSizeMultiplier={1.3}>
                  credits
                </Text>
              </View>
            </ProgressRing>
          </View>
          <View style={styles.headline}>
            <Text style={[Type.display, { color: theme.onHdr }]}>{percent}%</Text>
            <View style={[styles.block, { backgroundColor: theme.onHdr }]}>
              <Text style={[Type.display, { color: theme.hdr }]}>off</Text>
            </View>
          </View>
          <Text variant="body" color="mutedOnHdr" style={styles.centreText}>
            {at} friends are studying with Quizzly because of you. Thank you for sharing it.
          </Text>
        </View>
      </SafeAreaView>

      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={[styles.inner, styles.sheetBody]}>
          <HeroCard style={styles.prices}>
            <Text variant="caption" color="mutedOnInk" style={styles.caps}>
              YOUR NEW PRICES
            </Text>
            {rows.map((r) => (
              <View key={r.id} style={[styles.priceRow, { borderTopColor: theme.track }]}>
                <View style={styles.flex}>
                  <Text variant="heading" color="onInk">
                    {r.name}
                  </Text>
                  <Text variant="small" color="mutedOnInk">
                    {dollars(r.full)} → {dollars(r.cut)} a month
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text variant="small" color="mutedOnInk" style={styles.struck}>
                    {price(r.full, country)}
                  </Text>
                  <Text variant="title" color="onInk">
                    {price(r.cut, country)}
                    <Text variant="small" color="mutedOnInk">
                      {' '}
                      /month
                    </Text>
                  </Text>
                </View>
              </View>
            ))}
          </HeroCard>
          <Text variant="body" color="textSecondary">
            The discount is saved to your account. Use it whenever you&apos;re ready, or not at all.
          </Text>
          <ActionPill label="See plans" icon={ArrowRight} onPress={() => router.replace('/plans')} />
          <TextButton label="Later" color="textSecondary" onPress={close} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.three },
  pill: { borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: 44, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.four },
  rays: { width: RAYS, height: RAYS, alignItems: 'center', justifyContent: 'center' },
  centre: { alignItems: 'center' },
  headline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  block: { borderRadius: 14, paddingHorizontal: Spacing.twoHalf },
  centreText: { textAlign: 'center' },
  sheet: { flex: 1, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet },
  sheetBody: { paddingTop: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.three },
  prices: { gap: Spacing.three },
  caps: { letterSpacing: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
  flex: { flex: 1, gap: Spacing.half },
  right: { alignItems: 'flex-end' },
  struck: { textDecorationLine: 'line-through' },
});
