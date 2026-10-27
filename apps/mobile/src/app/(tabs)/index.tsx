import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ProfileHeader } from '@/components/profile-header';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { PlanRow } from '@/components/ui/plan-row';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useCourses, useDocuments } from '@/lib/library';
import { useMe } from '@/lib/profile';
import { usePractice } from '@/lib/quiz';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Monday, 26 October" */
function today(d = new Date()) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

type Item = { key: string; title: string; meta: string; hint?: string; onPress: () => void };

// Screen 14 (DESIGN.md §7), first version (FR-HOME-01): the date, a greeting and today's plan from
// what the app already knows: an unfinished quiz, the weakest topic, or the first upload. The exam
// countdown, week strip and Daily 5 arrive with the progress engine (BUILD_PLAN C3, D1).
export default function TodayScreen() {
  const theme = useTheme();
  const me = useMe();
  const courses = useCourses();
  const unfiled = useDocuments('unfiled');
  const practice = usePractice();
  const firstName = me.data?.full_name?.split(' ')[0];

  const loading = courses.isPending || practice.isPending;
  const noNotes = courses.isSuccess && courses.data.length === 0 && (unfiled.data?.length ?? 0) === 0;
  const unfinished = practice.data?.attempts.find((a) => a.status === 'in_progress');
  const weak = practice.data?.weak_topics[0];

  const plan: Item[] = [];
  if (noNotes) {
    plan.push({
      key: 'upload',
      title: 'Upload your first notes',
      meta: 'Slides, a PDF or photos of your notes',
      onPress: () => router.push('/upload'),
    });
  }
  if (unfinished) {
    plan.push({
      key: 'resume',
      title: 'Finish your quiz',
      meta: `${unfinished.title} · question ${Math.min(unfinished.current_index + 1, unfinished.question_count)} of ${unfinished.question_count}`,
      hint: 'Carries on where you stopped',
      onPress: () =>
        router.push({
          pathname: '/quiz/[id]/play',
          params: { id: unfinished.quiz_id, mode: unfinished.mode, attempt: unfinished.id },
        }),
    });
  }
  if (weak) {
    plan.push({
      key: 'weak',
      title: 'Fix a weak topic',
      meta: `${weak.title ?? 'Your weakest topic'} · ${Math.round((weak.score / Math.max(weak.max, 1)) * 100)}% so far`,
      hint: 'Sets up a short quiz on this topic',
      onPress: () =>
        router.push({ pathname: '/quiz/new', params: { documentId: weak.document_id, topicId: weak.topic_id } }),
    });
  }
  if (!noNotes && plan.length === 0) {
    plan.push({
      key: 'practise',
      title: 'Practise your notes',
      meta: 'Pick a course and take a short quiz',
      onPress: () => router.navigate('/library'),
    });
  }

  return (
    <Screen bottomInset={BottomTabInset}>
      <ProfileHeader me={me.data} title={today()} />
      <HighlightText highlight={firstName ?? 'there'}>{`${greeting()}, ${firstName ?? 'there'}`}</HighlightText>

      {courses.isError ? <Banner message={friendlyError(courses.error)} /> : null}

      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Today&apos;s plan
        </Text>
        {loading ? (
          [0, 1].map((i) => <View key={i} style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />)
        ) : (
          plan.map((item, i) => (
            <PlanRow
              key={item.key}
              ink={i === 0}
              title={item.title}
              meta={item.meta}
              onPress={item.onPress}
              accessibilityHint={item.hint}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  skeleton: { height: 76, borderRadius: Radius.card },
});
