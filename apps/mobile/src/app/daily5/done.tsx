import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ArrowRight, Check, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { StudyGrid } from '@/components/ui/study-grid';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { WeekDays } from '@/components/ui/week-strip';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type PlanItem, useHome, useStudyDays } from '@/lib/home';
import { useAttempt } from '@/lib/quiz';

const WEEKS = 5;

/** "2 min 40 s" */
function duration(start: string, end: string | null) {
  if (!end) return null;
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}

/** The next thing in today's plan after the Daily 5 (FR-HOME-05). */
function next(plan: PlanItem[]): { label: string; go: () => void } | null {
  const item = plan.find((p) => p.kind !== 'daily5');
  switch (item?.kind) {
    case 'weak_topic':
      return {
        label: 'Next: fix a weak topic',
        go: () => router.replace({ pathname: '/quiz/new', params: { documentId: item.document_id, topicId: item.topic_id } }),
      };
    case 'learn':
      return {
        label: 'Next: learn something new',
        go: () =>
          router.replace({ pathname: '/document/[id]/topic/[topicId]', params: { id: item.document_id, topicId: item.topic_id } }),
      };
    case 'practise_any':
      return { label: 'Next: practise a course', go: () => router.replace('/library') };
    default:
      return null;
  }
}

// Screen 15 (DESIGN.md §7, FR-HAB-01..04): the Daily 5 is done; this week against the goal and the
// last 5 weeks of study days. Kind copy: missing a day never resets anything (FR-HAB-03).
export default function Daily5DoneScreen() {
  const theme = useTheme();
  const { attempt: attemptId } = useLocalSearchParams<{ attempt: string }>();
  const attempt = useAttempt(attemptId);
  const home = useHome();
  const grid = useStudyDays(WEEKS);
  const a = attempt.data;
  const week = home.data?.week;
  const correct = a ? a.answers.filter((x) => x.is_correct).length : null;
  const total = a?.answers.length ?? 0;
  const goalMet = week ? week.study_days >= week.goal : false;
  const after = home.data ? next(home.data.plan) : null;
  const done = () => router.dismissTo('/');

  return (
    <Screen
      footer={
        <>
          {after ? (
            <ActionPill label={after.label} icon={ArrowRight} onPress={after.go} />
          ) : (
            <ActionPill label="Back to today" icon={ArrowRight} onPress={done} />
          )}
          {after ? <TextButton label="Done for today" onPress={done} /> : null}
        </>
      }>
      <IconButton icon={X} accessibilityLabel="Close" onPress={done} />

      <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel="Daily 5 done">
        <View style={[styles.check, { backgroundColor: theme.text }]}>
          <Check size={40} color={theme.onInk} strokeWidth={3} />
        </View>
        <View style={styles.titleText}>
          <HighlightText highlight="done">Daily 5 done</HighlightText>
          {a ? (
            <Text variant="body" color="textSecondary">
              {[`${correct} of ${total} correct`, duration(a.started_at, a.submitted_at)].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {week && home.data ? (
        <HeroCard>
          <View style={styles.cardHeader}>
            <Text variant="heading" color="onInk">
              {goalMet ? 'Weekly goal met' : 'This week'}
            </Text>
            <Text variant="small" color="mutedOnInk">
              {week.study_days} of {week.goal} days
            </Text>
          </View>
          <WeekDays days={week.days} today={home.data.today} tone="ink" />
          <Text variant="body" color="mutedOnInk">
            {week.weeks_in_a_row > 1 ? `${week.weeks_in_a_row} weeks in a row. ` : ''}
            Missing a day never resets your week.
          </Text>
        </HeroCard>
      ) : (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      )}

      {grid.data ? (
        <StudyGrid days={grid.data.days} today={grid.data.today} studyDays={grid.data.study_days} weeks={WEEKS} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  check: { width: 72, height: 72, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  titleText: { flex: 1, gap: Spacing.one },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  skeleton: { height: 160, borderRadius: Radius.card },
});
