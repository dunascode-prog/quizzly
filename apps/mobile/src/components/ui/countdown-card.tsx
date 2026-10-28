import { StyleSheet, View } from 'react-native';

import { Accent, Spacing } from '@/constants/theme';
import type { Countdown } from '@/lib/home';

import { HeroCard } from './hero-card';
import { Pill } from './pill';
import { ProgressRing } from './progress-ring';
import { Text } from './text';

const RING = 96;

/** "Up 18% this week", "Down 4% this week", or nothing when there's no value from a week ago. */
function change(c: Countdown) {
  if (c.change_this_week === null) return '';
  const pts = Math.round(c.change_this_week * 100);
  if (pts === 0) return ' Same as last week.';
  return pts > 0 ? ` Up ${pts}% this week.` : ` Down ${-pts}% this week.`;
}

type Props = {
  countdown: Countdown | null;
  /** Opens the course's exam date (or adds a course when there is none). */
  onSetDate: () => void;
};

/** Screen 14's hero (DESIGN.md §6, FR-HOME-02): the nearest exam and how ready the student is. The
 * ring and dot use the course's own accent (DESIGN.md §3.2). */
export function CountdownCard({ countdown: c, onSetDate }: Props) {
  if (!c || c.exam_date === null) {
    // New user, or no exam dates yet: ask for one.
    const pct = c ? Math.round(c.readiness * 100) : null;
    return (
      <HeroCard>
        <Text variant="caption" color="mutedOnInk">
          {c ? `${c.code.toUpperCase()} · ${pct}% READY` : 'EXAM COUNTDOWN'}
        </Text>
        <Text variant="title" color="onInk">
          When is your {c ? `${c.code} ` : 'first '}exam?
        </Text>
        <Text variant="body" color="mutedOnInk">
          Add the date and Today counts down with you.
        </Text>
        <View style={styles.action}>
          <Pill label="Add exam date" onPress={onSetDate} />
        </View>
      </HeroCard>
    );
  }

  const pct = Math.round(c.readiness * 100);
  const days = c.days_left ?? 0;
  const when = days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  return (
    <HeroCard
      style={styles.row}
      accessible
      accessibilityLabel={`${c.code} exam ${days === 0 ? 'today' : `in ${when}`}. You're ${pct}% ready.${change(c)}`}>
      <View style={styles.text}>
        <View style={styles.course}>
          <View style={[styles.dot, { backgroundColor: Accent[c.accent] }]} />
          <Text variant="small" color="mutedOnInk">
            {days === 0 ? `${c.code} exam is` : `${c.code} exam in`}
          </Text>
        </View>
        <Text variant="number" color="onInk" numberOfLines={1} adjustsFontSizeToFit>
          {when}
        </Text>
        <Text variant="body" color="onInk">
          You&apos;re {pct}% ready.{change(c)}
        </Text>
      </View>
      <ProgressRing size={RING} strokeWidth={8} value={c.readiness} accent={Accent[c.accent]} trackColor="track" label={`${pct}% ready`}>
        <Text variant="heading" color="onInk">
          {pct}%
        </Text>
        <Text variant="caption" color="mutedOnInk">
          ready
        </Text>
      </ProgressRing>
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.one },
  course: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: 6 },
  action: { flexDirection: 'row' },
});
