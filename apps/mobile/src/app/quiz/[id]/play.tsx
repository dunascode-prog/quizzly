import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArrowRight, Check, Flag, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { AnswerOption, type OptionState } from '@/components/ui/answer-option';
import { Banner } from '@/components/ui/banner';
import { CitationChip } from '@/components/ui/citation-chip';
import { HeroCard } from '@/components/ui/hero-card';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { FontFamily, Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import {
  type AnswerIn,
  answerText,
  isCorrect,
  type Mode,
  type Question,
  type Response,
  saveAnswers,
  submitAttempt,
  TYPE_LABELS,
  useQuiz,
  useStartAttempt,
} from '@/lib/quiz';

const LETTERS = ['A', 'B', 'C', 'D'];

type Given = AnswerIn & { correct: boolean };

function optionState(question: Question, i: number, chosen: Response | undefined, revealed: boolean): OptionState {
  const value = question.type === 'true_false' ? i === 0 : i;
  const isAnswer = question.type === 'true_false' ? question.answer === value : question.answer === i;
  if (revealed) {
    if (isAnswer) return 'correct';
    if (chosen === value) return 'wrong';
    return 'default';
  }
  return chosen === value ? 'selected' : 'default';
}

function Writing({ progress }: { progress: number | null }) {
  return (
    <View style={styles.writing} accessibilityLiveRegion="polite">
      <ProgressRing size={96} strokeWidth={6} value={Math.max(progress ?? 0, 5) / 100} label={`${Math.max(progress ?? 0, 5)}%`} color="text" trackColor="line" />
      <Text variant="title" style={styles.center}>
        Writing your questions
      </Text>
      <Text variant="body" color="textSecondary" style={styles.center}>
        They come from your own notes. This usually takes under 30 seconds; you can leave and come back.
      </Text>
    </View>
  );
}

// Screen 10 (DESIGN.md §7): one question at a time; practice shows feedback, exam waits (FR-QUIZ-01..03).
export default function PlayScreen() {
  const { id, mode: modeParam } = useLocalSearchParams<{ id: string; mode?: Mode }>();
  const quiz = useQuiz(id);
  const start = useStartAttempt(id);
  const [attemptId] = useState(() => randomUUID());
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<Record<string, Given>>({});
  const [draft, setDraft] = useState<Response | undefined>(undefined);
  const [blank, setBlank] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const unsaved = useRef<AnswerIn[]>([]);

  const data = quiz.data;
  const mode: Mode = modeParam ?? data?.mode ?? 'practice';
  const ready = data?.status === 'ready' && data.questions.length > 0;
  const questions = data?.questions ?? [];
  const question = questions[index];
  const last = index === questions.length - 1;
  const answered = question ? given[question.id] : undefined;
  const revealed = mode === 'practice' && Boolean(answered);

  // Start the attempt once the questions exist. The id is ours, so a retry can't duplicate it.
  useEffect(() => {
    if (ready && start.isIdle) start.mutate({ id: attemptId, mode });
  }, [ready, start, attemptId, mode]);

  const flush = (nextIndex: number) => {
    const batch = unsaved.current;
    unsaved.current = [];
    if (!start.isSuccess) {
      unsaved.current = batch; // not started yet: keep for later
      return;
    }
    saveAnswers(attemptId, batch, nextIndex).catch(() => {
      unsaved.current = [...batch, ...unsaved.current]; // offline: resend with the next save
    });
  };

  // Answers given before the attempt existed on the server go as soon as it does.
  useEffect(() => {
    if (start.isSuccess && unsaved.current.length) flush(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.isSuccess]);

  const record = (response: Response) => {
    if (!question) return;
    const answer: Given = { id: given[question.id]?.id ?? randomUUID(), question_id: question.id, response, correct: isCorrect(question, response) };
    setGiven((g) => ({ ...g, [question.id]: answer }));
    unsaved.current = [...unsaved.current.filter((a) => a.question_id !== question.id), answer];
    flush(index);
  };

  const choose = (response: Response) => {
    if (revealed) return;
    setDraft(response);
    if (mode === 'practice') record(response); // practice marks at once; exam waits for Next
  };

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const all = Object.values(given).map(({ id: aid, question_id, response }) => ({ id: aid, question_id, response }));
      await submitAttempt(attemptId, all);
      router.replace({ pathname: '/quiz/[id]/results', params: { id, attempt: attemptId } });
    } catch (e) {
      setError(friendlyError(e));
      setSubmitting(false);
    }
  };

  const next = () => {
    if (mode === 'exam' && question && draft !== undefined && given[question.id]?.response !== draft) record(draft);
    if (last) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setDraft(undefined); // questions only move forward, so each starts unanswered
    setBlank('');
  };

  if (!data || !ready) {
    return (
      <Screen>
        <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        {quiz.isError ? (
          <Banner message={friendlyError(quiz.error)} />
        ) : data?.status === 'failed' ? (
          <Banner message="We couldn't write questions from these notes. Go back and try again; it won't use up your daily limit." />
        ) : (
          <Writing progress={data?.progress ?? null} />
        )}
      </Screen>
    );
  }

  const isBlank = question.type === 'fill_blank';
  const canContinue = mode === 'practice' ? Boolean(answered) : draft !== undefined && draft !== '';
  // One main action (DESIGN.md §7): in practice a blank is checked first, then the same pill moves on.
  const checking = mode === 'practice' && isBlank && !answered;
  const footer = checking ? (
    <ActionPill label="Check" icon={Check} onPress={() => record(blank.trim())} disabled={!blank.trim()} />
  ) : (
    <ActionPill
      label={last ? (mode === 'exam' ? 'Submit' : 'See results') : 'Next'}
      icon={last ? Check : ArrowRight}
      onPress={next}
      loading={submitting}
      disabled={!canContinue && !(mode === 'exam' && last)}
    />
  );

  return (
    <Screen footer={footer}>
      <View style={styles.topBar}>
        <IconButton icon={X} accessibilityLabel="Close quiz" onPress={() => router.back()} />
        {mode === 'exam' ? (
          <Text variant="label" color="textSecondary">
            Exam mode
          </Text>
        ) : null}
        <IconButton
          icon={Flag}
          accessibilityLabel="Report this question"
          onPress={() => router.push({ pathname: '/report', params: { targetId: question.id, targetType: 'question' } })}
        />
      </View>

      {data.notice && index === 0 ? <Banner tone="info" message={data.notice} /> : null}

      <HeroCard>
        <View style={styles.heroTop}>
          <Text variant="small" color="mutedOnInk" style={styles.flex}>
            {TYPE_LABELS[question.type]}
          </Text>
          <ProgressRing size={56} value={(index + 1) / questions.length} label={`${index + 1}/${questions.length}`} />
        </View>
        <Text variant="title" color="onInk" accessibilityRole="header">
          {question.stem}
        </Text>
      </HeroCard>

      {isBlank ? (
        <View style={styles.options}>
          <TextField
            label="Your answer"
            value={blank}
            onChangeText={(t) => {
              setBlank(t);
              if (mode === 'exam') setDraft(t.trim() ? t : undefined);
            }}
            editable={!revealed}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => mode === 'practice' && blank.trim() && record(blank.trim())}
          />
        </View>
      ) : (
        <View style={styles.options} accessibilityRole="radiogroup">
          {(question.type === 'true_false' ? ['True', 'False'] : (question.options ?? [])).map((label, i) => (
            <AnswerOption
              key={i}
              letter={LETTERS[i]}
              label={label}
              state={optionState(question, i, draft, revealed)}
              disabled={revealed}
              onPress={() => choose(question.type === 'true_false' ? i === 0 : i)}
            />
          ))}
        </View>
      )}

      {revealed && answered ? (
        <View style={styles.feedback} accessibilityLiveRegion="polite">
          <Text variant="body">
            <Text variant="body" color={answered.correct ? 'success' : 'danger'} style={styles.verdict}>
              {answered.correct ? 'Correct. ' : 'Not quite. '}
            </Text>
            {!answered.correct && isBlank ? `The answer is "${answerText(question)}". ` : ''}
            {question.explanation}
          </Text>
          <View style={styles.chips}>
            {question.source_pages.slice(0, 3).map((p) => (
              <CitationChip
                key={p}
                page={p}
                onPress={() => router.push({ pathname: '/document/[id]/page/[n]', params: { id: data.document_id, n: String(p) } })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  options: { gap: Spacing.twoHalf },
  feedback: { gap: Spacing.two },
  verdict: { fontFamily: FontFamily.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  writing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  center: { textAlign: 'center' },
});
