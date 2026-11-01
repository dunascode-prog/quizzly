import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Check, Info } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Accent, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LAVENDER_AT, price, STUDY_DAYS_NEEDED, useInvite, usePlans } from '@/lib/plans';
import { useMe } from '@/lib/profile';

const STEPS = [
  { title: 'They join with your link', sub: "Your link or QR code, on Android. We can't see who you send it to." },
  { title: 'They finish setup', sub: 'They confirm their email and set up their profile.' },
  {
    title: `They study on ${STUDY_DAYS_NEEDED} different days`,
    sub: 'Any practice counts: a quiz, flashcards or a Daily 5. Then you get 1 credit.',
  },
];

// 23b How credits work (DESIGN.md §7, FR-INV-03/05): the three steps, the fair-play note word for
// word, and the two rewards.
export default function HowCreditsWork() {
  const theme = useTheme();
  const invite = useInvite().data;
  const plans = usePlans().data;
  const country = useMe().data?.country;
  const percent = invite?.discount.percent ?? 10;
  const at = invite?.discount.at ?? 5;
  const cut = (id: 'student' | 'premium') => {
    const usd = plans?.plans.find((p) => p.id === id)?.price_usd ?? (id === 'student' ? 6 : 10);
    return price((usd * (100 - percent)) / 100, country);
  };

  return (
    <Sheet title="How credits work" highlight="work" onClose={() => router.back()}>
      {STEPS.map((s, n) => (
        <View key={s.title} style={styles.step}>
          <View style={[styles.number, { backgroundColor: theme.text }]}>
            <Text variant="label" color="onInk" maxFontSizeMultiplier={1.3}>
              {n + 1}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="label">{s.title}</Text>
            <Text variant="small" color="textSecondary">
              {s.sub}
            </Text>
          </View>
        </View>
      ))}

      <View style={[styles.note, { backgroundColor: theme.backgroundSelected }]}>
        <Info size={20} color={theme.text} strokeWidth={2} />
        <Text variant="body" style={styles.flex}>
          Credits count real friends only. One credit per person and phone. Accounts made to collect rewards
          don&apos;t count.
        </Text>
      </View>

      <Text variant="label">Rewards</Text>
      <View style={[styles.reward, { backgroundColor: theme.backgroundElement }]}>
        {/* The Lavender swatch is one of the places an accent may appear (DESIGN.md §3.2). */}
        <View style={styles.swatch} accessible={false}>
          <View style={[styles.half, { backgroundColor: theme.text }]} />
          <View style={[styles.half, { backgroundColor: Accent.lavender }]} />
        </View>
        <View style={styles.flex}>
          <Text variant="label">Lavender theme</Text>
          <Text variant="small" color="textSecondary">
            A new colour for rings and highlights
          </Text>
        </View>
        <Text variant="label">{LAVENDER_AT} credits</Text>
      </View>
      <View style={[styles.reward, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.percent, { backgroundColor: theme.text }]}>
          <Text variant="caption" color="onInk" maxFontSizeMultiplier={1.3}>
            {percent}%
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="label">{percent}% off Student or Premium</Text>
          <Text variant="small" color="textSecondary">
            Student {cut('student')} · Premium {cut('premium')} a month
          </Text>
        </View>
        <Text variant="label">{at} credits</Text>
      </View>

      <ActionPill label="Got it" icon={Check} onPress={() => router.back()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.half },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  number: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.twoHalf, padding: Spacing.three, borderRadius: Radius.option },
  reward: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option },
  swatch: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', flexDirection: 'row' },
  half: { flex: 1 },
  percent: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
