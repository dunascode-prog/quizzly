import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromIsoDay } from '@/lib/format';
import type { WeekDay } from '@/lib/home';

import { Text } from './text';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SIZE = 28;

type Props = {
  days: WeekDay[];
  today: string;
  studyDays: number;
  goal: number;
};

/** "This week" (DESIGN.md §6, FR-HOME-04): studied days filled, today outlined, days still to
 * come light. Missing a day is just a grey circle: no streak to break (FR-HAB-03). */
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
      <View style={styles.days} accessibilityRole="summary" accessibilityLabel={`This week: ${studyDays} of ${goal} study days`}>
        {days.map((d, i) => {
          const isToday = d.day === today;
          const future = fromIsoDay(d.day) > fromIsoDay(today);
          const fill = d.studied ? theme.text : future || isToday ? theme.backgroundSelected : theme.line;
          const state = d.studied ? 'studied' : isToday ? 'today' : future ? 'still to come' : 'not studied';
          return (
            <View key={d.day} style={styles.day} accessible accessibilityLabel={`${NAMES[i]}, ${state}`}>
              <View
                style={[
                  styles.circle,
                  { backgroundColor: fill },
                  isToday && !d.studied && { borderWidth: 2, borderStyle: 'dashed', borderColor: theme.text, backgroundColor: 'transparent' },
                ]}
              />
              <Text variant="caption" color="textSecondary">
                {LETTERS[i]}
              </Text>
            </View>
          );
        })}
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
