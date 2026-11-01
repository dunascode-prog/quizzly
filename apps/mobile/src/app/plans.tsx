import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArrowRight, Check, ChevronLeft, Gift } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { NeedsInternet } from '@/components/ui/needs-internet';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Size, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useOnline } from '@/lib/network';
import { type Plan, type PlanId, planName, price, priceNote, usePlans } from '@/lib/plans';
import { useMe } from '@/lib/profile';

// Buying needs Google Play Billing, a native module that comes with the next dev build; until then
// the pill says so instead of starting a checkout (FR-PLAN-03).
const BILLING_IN_THIS_BUILD = false;

const LIMIT_LINES: { key: keyof Plan['limits']; label: string }[] = [
  { key: 'upload', label: 'uploads' },
  { key: 'question_set', label: 'quiz sets' },
  { key: 'explanation', label: 'explanations' },
  { key: 'chat_message', label: 'chat messages' },
];

function storage(mb: number) {
  return mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`;
}

// Screen 32 Plans (DESIGN.md §7, FR-PLAN-01): Free, Student and Premium; one paid card selected; the
// pinned ActionPill follows the selection. With the invite reward the old price is struck through.
export default function PlansScreen() {
  const theme = useTheme();
  const online = useOnline();
  const query = usePlans();
  const country = useMe().data?.country;
  const data = query.data;
  const [picked, setPicked] = useState<PlanId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const selected: PlanId = picked ?? (data?.current === 'premium' ? 'premium' : 'student');
  const isCurrent = data?.current === selected;
  const trial = data?.plans.find((p) => p.id === selected)?.trial_days;
  const ready = Boolean(data?.payments_ready) && BILLING_IN_THIS_BUILD;

  const choose = () => {
    if (!ready) {
      setNote("Paying in the app is coming soon. Free stays free in the meantime.");
      return;
    }
  };

  return (
    <Screen
      footer={
        <>
          <ActionPill
            label={
              isCurrent
                ? 'Your current plan'
                : !ready
                  ? 'Coming soon'
                  : trial
                    ? `Start ${trial}-day free trial`
                    : `Choose ${planName(selected)}`
            }
            icon={ArrowRight}
            onPress={choose}
            disabled={!data || isCurrent}
          />
          <Text variant="small" color="textSecondary" style={styles.center}>
            {trial
              ? `${trial} days free, then billed monthly through Google Play. Cancel any time.`
              : 'Billed monthly through Google Play. Cancel any time.'}
          </Text>
        </>
      }>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="plan">Pick a plan</HighlightText>
      <Text variant="body" color="textSecondary">
        Free stays free. Paid plans give you more room for exam season.
      </Text>
      {query.isError ? <Banner message={friendlyError(query.error)} /> : null}
      {!online && !data ? <NeedsInternet what="Plans" /> : null}
      {note ? <Banner message={note} /> : null}

      {data ? (
        <View style={styles.cards} accessibilityRole="radiogroup" accessibilityLabel="Paid plans">
          {data.plans.map((p) =>
            p.id === 'free' ? (
              <FreeCard key={p.id} plan={p} current={data.current === 'free'} country={country} />
            ) : (
              <PaidCard
                key={p.id}
                plan={p}
                selected={selected === p.id}
                current={data.current === p.id}
                discount={data.discount_percent}
                country={country}
                onPress={() => {
                  setPicked(p.id);
                  setNote(null);
                }}
              />
            ),
          )}
        </View>
      ) : online ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : null}
    </Screen>
  );
}

function Lines({ plan, onInk }: { plan: Plan; onInk?: boolean }) {
  const theme = useTheme();
  const lines = [
    ...LIMIT_LINES.map((l) => `${plan.limits[l.key]} ${l.label} a day`),
    `${storage(plan.storage_mb)} for your notes`,
    ...plan.extras,
  ];
  return (
    <View style={styles.lines}>
      {lines.map((line) => (
        <View key={line} style={styles.line}>
          <Check size={18} color={onInk ? theme.mutedOnInk : theme.textSecondary} strokeWidth={2.5} />
          <Text variant="body" color={onInk ? 'onInk' : 'text'} style={styles.flex}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FreeCard({ plan, current, country }: { plan: Plan; current: boolean; country?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.outlined, { borderColor: theme.line }]}>
      <View style={styles.head}>
        <Text variant="heading" style={styles.flex}>
          Free
        </Text>
        {current ? (
          <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
            <Text variant="caption">Current plan</Text>
          </View>
        ) : null}
      </View>
      <Text style={[Type.title, { color: theme.text }]}>{price(0, country)}</Text>
      <Lines plan={plan} />
    </View>
  );
}

function PaidCard({
  plan,
  selected,
  current,
  discount,
  country,
  onPress,
}: {
  plan: Plan;
  selected: boolean;
  current: boolean;
  discount: number | null;
  country?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const now = plan.discounted_price_usd ?? plan.price_usd;
  const noteText = priceNote(now, country);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${planName(plan.id)}, ${price(now, country)} a month${discount ? `, invite reward ${discount}% off` : ''}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.92 : 1 },
      ]}>
      <View style={styles.head}>
        <Text variant="heading" color={selected ? 'onInk' : 'text'} style={styles.flex}>
          {planName(plan.id)}
        </Text>
        {current ? (
          <View style={[styles.chip, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement }]}>
            <Text variant="caption">Current plan</Text>
          </View>
        ) : null}
        <View
          style={[
            styles.radio,
            selected ? { backgroundColor: theme.backgroundSelected } : { borderWidth: 2, borderColor: theme.line },
          ]}>
          {selected ? <Check size={16} color={theme.text} strokeWidth={3} /> : null}
        </View>
      </View>
      {plan.trial_days ? (
        <View style={[styles.reward, { backgroundColor: selected ? theme.backgroundSelected : theme.text }]}>
          <Text variant="caption" color={selected ? 'text' : 'onInk'}>
            {plan.trial_days} days free
          </Text>
        </View>
      ) : null}
      {discount ? (
        // Ink or white chip, never an accent (CREDITS_AND_PLANS §3).
        <View style={[styles.reward, { backgroundColor: selected ? theme.backgroundSelected : theme.text }]}>
          <Gift size={16} color={selected ? theme.text : theme.onInk} strokeWidth={2} />
          <Text variant="caption" color={selected ? 'text' : 'onInk'}>
            Invite reward · {discount}% off
          </Text>
        </View>
      ) : null}
      <View style={styles.priceRow}>
        {plan.discounted_price_usd ? (
          <Text variant="body" color={selected ? 'mutedOnInk' : 'textSecondary'} style={styles.struck}>
            {price(plan.price_usd, country)}
          </Text>
        ) : null}
        <Text style={[Type.title, { color: selected ? theme.onInk : theme.text }]}>{price(now, country)}</Text>
        <Text variant="small" color={selected ? 'mutedOnInk' : 'textSecondary'}>
          /month{noteText ? ` · ${noteText}` : ''}
        </Text>
      </View>
      <Lines plan={plan} onInk={selected} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  cards: { gap: Spacing.three },
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.twoHalf },
  outlined: { borderWidth: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  radio: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing.twoHalf, paddingVertical: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.two },
  struck: { textDecorationLine: 'line-through' },
  lines: { gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, minHeight: Size.minTouch / 2 },
  skeleton: { height: 320, borderRadius: Radius.card },
});
