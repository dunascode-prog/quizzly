import { StyleSheet, View } from 'react-native';

import { Accent, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromIsoDay } from '@/lib/format';
import type { WeekDay } from '@/lib/home';

import { Text } from './text';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** FR-HAB-04: 4 levels by questions answered (0, 1–9, 10–29, 30+). The fills get darker in light
 * mode and brighter in dark mode as activity rises (DESIGN.md §3.3). */
const LEVELS: ThemeColor[] = ['backgroundSelected', 'mutedOnInk', 'textSecondary', 'text'];
function level(questions: number) {
  return questions >= 30 ? 3 : questions >= 10 ? 2 : questions >= 1 ? 1 : 0;
}

function label(day: string, questions: number) {
  const d = fromIsoDay(day);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${questions} question${questions === 1 ? '' : 's'}`;
}

type Props = { days: WeekDay[]; today: string; studyDays: number; weeks: number };

/** "Your study days" (DESIGN.md §6, screen 15): whole weeks as rows, today outlined in Lagoon. */
export function StudyGrid({ days, today, studyDays, weeks }: Props) {
  const theme = useTheme();
  const rows = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7));
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <Text variant="label">Your study days</Text>
        <Text variant="small" color="textSecondary">
          {studyDays} in {weeks} weeks
        </Text>
      </View>
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row[0].day} style={styles.row}>
            {row.map((d) => {
              const future = fromIsoDay(d.day) > fromIsoDay(today);
              return (
                <View
                  key={d.day}
                  accessible={!future}
                  accessibilityLabel={future ? undefined : label(d.day, d.questions)}
                  style={[
                    styles.cell,
                    { backgroundColor: theme[future ? 'backgroundSelected' : LEVELS[level(d.questions)]] },
                    d.day === today && { borderWidth: 3, borderColor: Accent.lagoon },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend} accessible accessibilityLabel="Darker means more questions answered">
        <Text variant="small" color="textSecondary">
          Less
        </Text>
        {LEVELS.map((c) => (
          <View key={c} style={[styles.swatch, { backgroundColor: theme[c] }]} />
        ))}
        <Text variant="small" color="textSecondary">
          More
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  grid: { gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, height: 34, borderRadius: Radius.gridCell },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
});
