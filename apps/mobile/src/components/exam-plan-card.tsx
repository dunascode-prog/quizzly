import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Gift } from '@/components/icons';
import { Pill } from '@/components/ui/pill';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deviceStore } from '@/lib/device-store';
import type { Countdown } from '@/lib/home';
import { usePlans } from '@/lib/plans';
import { useMe } from '@/lib/profile';

const WITHIN_DAYS = 14;
const SNOOZE_MS = 3 * 24 * 60 * 60_000; // "Not now" hides it for 3 days
const KEY = 'quizzly.examPlanCard.snoozedUntil';

/** FR-PLAN-05: when a free student's real exam is close, Today offers Student once in a while. The
 * urgency is the student's own exam date, never a countdown we invent (NFR-14). */
export function ExamPlanCard({ countdown }: { countdown: Countdown | null }) {
  const theme = useTheme();
  const plan = useMe().data?.plan ?? 'free';
  const trial = usePlans().data?.plans.find((p) => p.id === 'student')?.trial_days;
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    void deviceStore
      .getItem(KEY)
      .then((until) => setSnoozed(Boolean(until && Number(until) > Date.now())))
      .catch(() => setSnoozed(false));
  }, []);

  const days = countdown?.days_left;
  if (plan !== 'free' || snoozed || days == null || days < 0 || days > WITHIN_DAYS || !countdown) return null;

  const when = days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `is in ${days} days`;
  const snooze = () => {
    setSnoozed(true);
    void deviceStore.setItem(KEY, String(Date.now() + SNOOZE_MS));
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Gift size={20} color={theme.text} strokeWidth={2} />
        </View>
        <Text variant="label" style={styles.flex}>
          Your {countdown.code} exam {when}.
        </Text>
      </View>
      <Text variant="body" color="textSecondary">
        Student gives you 30 quiz sets a day, all quiz sizes and timed exam practice.
      </Text>
      <View style={styles.actions}>
        <Pill label={trial ? `Try ${trial} days free` : 'See plans'} selected onPress={() => router.push('/plans')} />
        <TextButton label="Not now" compact color="textSecondary" onPress={snooze} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.twoHalf },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
