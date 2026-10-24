import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { MarkedAnswer } from '@/components/marked-answer';
import { Banner } from '@/components/ui/banner';
import { CitationChip } from '@/components/ui/citation-chip';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { answerText, isWritten, marksText, responseText, useAttempt, useQuiz } from '@/lib/quiz';

// Review after a quiz (FR-QUIZ-02 "full review"): each question, your answer and the right one.
export default function ReviewScreen() {
  const theme = useTheme();
  const { id, attempt: attemptId } = useLocalSearchParams<{ id: string; attempt: string }>();
  const quiz = useQuiz(id);
  const attempt = useAttempt(attemptId);
  const byQuestion = new Map((attempt.data?.answers ?? []).map((a) => [a.question_id, a]));

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text variant="label" accessibilityRole="header" style={styles.title}>
          Review answers
        </Text>
        <View style={styles.spacer} />
      </View>
      {quiz.isError || attempt.isError ? <Banner message={friendlyError(quiz.error ?? attempt.error)} /> : null}
      {quiz.data?.questions.map((q, i) => {
        const given = byQuestion.get(q.id);
        const right = given?.is_correct === true;
        if (isWritten(q)) {
          return (
            <View key={q.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <Text variant="small" color="textSecondary">
                Question {i + 1} · {given?.score != null ? `${marksText(given.score)} / ${q.marks}` : q.marks} marks
              </Text>
              <Text variant="label" style={styles.stem}>
                {q.stem}
              </Text>
              <Text variant="body" color="textSecondary">
                {given ? 'Your answer: ' : ''}
                {responseText(q, given?.response)}
              </Text>
              {given?.feedback ? (
                <MarkedAnswer feedback={given.feedback} showModelAnswer onSurface />
              ) : (
                <Text variant="body">Model answer: {answerText(q)}</Text>
              )}
            </View>
          );
        }
        return (
          <View key={q.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <Text variant="small" color="textSecondary">
              Question {i + 1}
            </Text>
            <Text variant="label" style={styles.stem}>
              {q.stem}
            </Text>
            <Text variant="body" color={right ? 'success' : 'danger'}>
              {right ? 'Correct: ' : given ? 'Your answer: ' : ''}
              {responseText(q, given?.response)}
            </Text>
            {!right ? <Text variant="body">Answer: {answerText(q)}</Text> : null}
            <Text variant="small" color="textSecondary">
              {q.explanation}
            </Text>
            <View style={styles.chips}>
              {q.source_pages.slice(0, 3).map((p) => (
                <CitationChip
                  key={p}
                  page={p}
                  onPress={() => router.push({ pathname: '/document/[id]/page/[n]', params: { id: quiz.data!.document_id, n: String(p) } })}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: 52 },
  card: { borderRadius: Radius.card - 4, padding: Spacing.gutter - 2, gap: Spacing.two },
  stem: { fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
