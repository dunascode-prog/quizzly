import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { type AttemptSummary, usePractice } from '@/lib/quiz';

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function pct(a: AttemptSummary) {
  return a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : 0;
}

function open(a: AttemptSummary) {
  if (a.status === 'in_progress') {
    router.push({ pathname: '/quiz/[id]/play', params: { id: a.quiz_id, mode: a.mode, attempt: a.id } });
  } else {
    router.push({ pathname: '/quiz/[id]/results', params: { id: a.quiz_id, attempt: a.id } });
  }
}

function AttemptCard({ a }: { a: AttemptSummary }) {
  const mode = a.mode === 'exam' ? 'Exam' : 'Practice';
  if (a.status === 'in_progress') {
    return (
      <ListCard
        title={a.title}
        meta={`${mode} · question ${Math.min(a.current_index + 1, a.question_count)} of ${a.question_count} · ${day(a.started_at)}`}
        onPress={() => open(a)}
        accessibilityHint="Carries on where you stopped"
        trailing={<Pill label="Resume" onPress={() => open(a)} />}
      />
    );
  }
  if (a.status === 'marking') {
    return <ListCard title={a.title} meta={`${mode} · marking… · ${day(a.started_at)}`} onPress={() => open(a)} />;
  }
  return (
    <ListCard
      title={a.title}
      meta={`${mode} · ${pct(a)}% · ${day(a.submitted_at ?? a.started_at)}`}
      onPress={() => open(a)}
      accessibilityHint="Opens the results"
      trailing={<ProgressRing size={52} value={pct(a) / 100} label={`${pct(a)}%`} color="text" trackColor="line" />}
    />
  );
}

// Practice tab (DESIGN.md §7): past quizzes with their scores, Resume for unfinished ones
// (FR-QUIZ-05), and the weakest topics across recent quizzes (FR-QUIZ-07).
export default function PracticeScreen() {
  const theme = useTheme();
  const practice = usePractice();
  const { refetch } = practice;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const attempts = practice.data?.attempts ?? [];
  const weak = practice.data?.weak_topics ?? [];

  return (
    <Screen bottomInset={BottomTabInset}>
      <HighlightText highlight="practice">Your practice</HighlightText>
      {practice.isError ? <Banner message={friendlyError(practice.error)} /> : null}

      {practice.data && attempts.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
          <Text variant="title">No quizzes yet</Text>
          <Text variant="body" color="textSecondary">
            Open a document and build a quiz. Your scores and the topics to revise will show up here.
          </Text>
        </View>
      ) : null}

      {weak.length ? (
        <View style={styles.group}>
          <Text variant="heading" accessibilityRole="header">
            Revise next
          </Text>
          {weak.map((t) => {
            const p = t.max ? Math.round((t.score / t.max) * 100) : 0;
            return (
              <Pressable
                key={`${t.document_id}:${t.topic_id}`}
                onPress={() => router.push({ pathname: '/quiz/new', params: { documentId: t.document_id, topicId: t.topic_id } })}
                accessibilityRole="button"
                accessibilityLabel={`${t.title ?? 'Topic'}: ${p} percent`}
                accessibilityHint="Builds a quiz on this topic"
                style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
                <Text variant="label" style={styles.flex}>
                  {t.title ?? 'Topic'}
                </Text>
                <Text variant="label" color={p < 50 ? 'danger' : 'warning'}>
                  {p}%
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {attempts.length ? (
        <View style={styles.group}>
          <Text variant="heading" accessibilityRole="header">
            Recent quizzes
          </Text>
          {attempts.map((a) => (
            <AttemptCard key={a.id} a={a} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: Radius.card, padding: Spacing.four, gap: Spacing.two },
  group: { gap: Spacing.twoHalf },
  row: {
    minHeight: Size.field - 8,
    borderRadius: Radius.option + 2,
    paddingHorizontal: Spacing.gutter - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: { flex: 1 },
});
