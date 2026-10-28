import { StyleSheet, View } from 'react-native';

import { Accent, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromIsoDay } from '@/lib/format';
import type { WeekDay } from '@/lib/home';

import { Text } from './text';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SIZE = 28;

type DaysProps = {
  days: WeekDay[];
  today: string;
  /** `ink`: inside an ink card (screen 15), with today in Lagoon once studied. */
  tone?: 'surface' | 'ink';
};

/** The seven days (DESIGN.md §6, FR-HOME-04): studied days filled, today outlined, days still to
 * come light. Missing a day is just a grey circle: no streak to break (FR-HAB-03). */
export function WeekDays({ days, today, tone = 'surface' }: DaysProps) {
  const theme = useTheme();
  const ink = tone === 'ink';
  return (
    <View style={styles.days}>
      {days.map((d, i) => {
        const isToday = d.day === today;
        const future = fromIsoDay(d.day) > fromIsoDay(today);
        const state = d.studied ? 'studied' : isToday ? 'today' : future ? 'still to come' : 'not studied';
        let fill: string = ink ? theme.inkRaised : theme.line;
        if (d.studied) fill = ink ? (isToday ? Accent.lagoon : theme.onInk) : theme.text;
        else if (future || isToday) fill = ink ? 'transparent' : theme.backgroundSelected;
        const outline =
          !d.studied && isToday
            ? { borderWidth: 2, borderStyle: 'dashed' as const, borderColor: ink ? theme.onInk : theme.text }
            : ink && future
              ? { borderWidth: 1.5, borderColor: theme.track }
              : null;
        return (
          <View key={d.day} style={styles.day} accessible accessibilityLabel={`${NAMES[i]}, ${state}`}>
            <View style={[styles.circle, { backgroundColor: fill }, outline]} />
            <Text variant="caption" color={ink ? 'mutedOnInk' : 'textSecondary'}>
              {LETTERS[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

type Props = {
  days: WeekDay[];
  today: string;
  studyDays: number;
  goal: number;
};

/** "This week" card on Today (screen 14). */
export function WeekStrip({ days, today, studyDays, goal }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <Text variant="label">This week</Text>
        <Text variant="small" color="textSecondary">
          {studyDays} of {goal} study days
        </Text>
      </View>
      <View accessibilityRole="summary" accessibilityLabel={`This week: ${studyDays} of ${goal} study days`}>
        <WeekDays days={days} today={today} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: Spacing.one, minWidth: 32 },
  circle: { width: SIZE, height: SIZE, borderRadius: Radius.full },
});
