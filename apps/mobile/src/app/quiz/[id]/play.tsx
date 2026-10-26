import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArrowRight, Check, Flag, X } from '@/components/icons';
import { MarkedAnswer } from '@/components/marked-answer';
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
import { ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { enqueue, flush, isPending } from '@/lib/outbox';
import {
  type AnswerIn,
  answerText,
  type Attempt,
  isCorrect,
  isWritten,
  marksText,
  type Mode,
  type Question,
  type Response,
  TYPE_LABELS,
  useAttempt,
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

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

// Screens 10–11 (DESIGN.md §7): one question at a time; practice shows feedback (written answers are
// marked by the AI against the rubric), exam waits and may be timed (FR-QUIZ-01..05).
export default function PlayScreen() {
  const { id, mode: modeParam, attempt: resumeId } = useLocalSearchParams<{ id: string; mode?: Mode; attempt?: string }>();
  const quiz = useQuiz(id);
  const start = useStartAttempt(id);
  const [attemptId] = useState(() => resumeId ?? randomUUID());
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<Record<string, Given>>({});
  const [draft, setDraft] = useState<Response | undefined>(undefined);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Set when the attempt began without a connection; its start waits in the outbox (FR-OFF-02).
  const [offlineStart, setOfflineStart] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);
  const finishing = useRef(false);
  const finishRef = useRef<() => Promise<void>>(async () => {});

  const data = quiz.data;
  const started = start.data;
  const mode: Mode = started?.mode ?? modeParam ?? data?.mode ?? 'practice';
  const ready = data?.status === 'ready' && data.questions.length > 0;
  const questions = data?.questions ?? [];
  const question = questions[index];
  const last = index === questions.length - 1;
  const answered = question ? given[question.id] : undefined;
  const revealed = mode === 'practice' && Boolean(answered);
  const written = question ? isWritten(question) : false;

  // A written answer in practice is marked on the server; poll until its feedback arrives.
  const begun = start.isSuccess || offlineStart !== null;
  const attempt = useAttempt(attemptId, { enabled: begun, waitFor: revealed && written ? question?.id : undefined });
  const marked = question ? attempt.data?.answers.find((a) => a.question_id === question.id) : undefined;
  const waiting = revealed && written && !marked?.feedback;

  // Resume (FR-QUIZ-05): restore the answers and move to the first unanswered question.
  const restore = (a: Attempt) => {
    if (a.status !== 'in_progress') {
      router.replace({ pathname: '/quiz/[id]/results', params: { id, attempt: attemptId } });
      return;
    }
    if (!a.answers.length) return;
    const restoredAnswers: Record<string, Given> = {};
    for (const x of a.answers) {
      restoredAnswers[x.question_id] = { id: randomUUID(), question_id: x.question_id, response: x.response, correct: x.is_correct === true };
    }
    setGiven(restoredAnswers);
    let i = Math.min(a.current_index, questions.length - 1);
    while (i < questions.length - 1 && restoredAnswers[questions[i].id]) i++;
    setIndex(i);
    const current = restoredAnswers[questions[i].id];
    if (a.mode === 'exam' && current) {
      setDraft(current.response);
      if (typeof current.response === 'string') setText(current.response);
    }
  };

  // Start the attempt once the questions exist. The id is ours, so a retry can't duplicate it, and
  // a resumed attempt comes back with its answers.
  useEffect(() => {
    if (!ready || !start.isIdle) return;
    start.mutate(
      { id: attemptId, mode },
      {
        onSuccess: (a) => {
          restore(a);
          void flush(); // anything queued for this attempt can go now
        },
        onError: (e) => {
          // No connection: play from the saved quiz and send the start later. A resume needs the
          // server's copy of the answers, so it waits for a connection instead.
          if (e instanceof ApiError || resumeId) return;
          setOfflineStart(Date.now());
          void enqueue({ kind: 'start', attemptId, quizId: id, mode });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, start, attemptId, mode]);

  // Exam timer (FR-QUIZ-02): counts down from the server's start time (or this phone's, offline).
  const limit = started?.time_limit_sec ?? (offlineStart !== null ? (data?.time_limit_sec ?? null) : null);
  const startedAt = started ? new Date(started.started_at).getTime() : offlineStart;
  const deadline = limit && startedAt !== null ? startedAt + limit * 1000 : null;
  const left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) void finishRef.current(); // time's up: unanswered questions score zero
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const record = (response: Response) => {
    if (!question) return;
    const answer: Given = { id: given[question.id]?.id ?? randomUUID(), question_id: question.id, response, correct: isCorrect(question, response) };
    setGiven((g) => ({ ...g, [question.id]: answer }));
    // Saved on the phone first, then sent; offline it waits for the connection (FR-OFF-02).
    const saved = enqueue({
      kind: 'answers',
      attemptId,
      answers: [{ id: answer.id, question_id: answer.question_id, response }],
      currentIndex: index,
    });
    if (begun) void saved.then(flush);
  };

  const choose = (response: Response) => {
    if (revealed) return;
    setDraft(response);
    if (mode === 'practice') record(response); // practice marks at once; exam waits for Next
  };

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    setSubmitting(true);
    setError(null);
    const all = { ...given };
    // The exam answer on screen counts even if time ran out before Next was pressed.
    if (mode === 'exam' && question && draft !== undefined && draft !== '') {
      all[question.id] = { id: given[question.id]?.id ?? randomUUID(), question_id: question.id, response: draft, correct: false };
    }
    const answers: AnswerIn[] = Object.values(all).map(({ id: aid, question_id, response }) => ({ id: aid, question_id, response }));
    await enqueue({ kind: 'submit', attemptId, answers });
    await flush();
    if (isPending(attemptId)) {
      setQueued(true); // offline: marked when the phone reconnects
      setSubmitting(false);
      return;
    }
    router.replace({ pathname: '/quiz/[id]/results', params: { id, attempt: attemptId } });
  };

  useEffect(() => {
    finishRef.current = finish;
  });

  const next = () => {
    if (mode === 'exam' && question && draft !== undefined && given[question.id]?.response !== draft) record(draft);
    if (last) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setDraft(undefined); // questions only move forward, so each starts unanswered
    setText('');
  };

  if (queued) {
    return (
      <Screen
        footer={
          <ActionPill label="Back to Practice" icon={ArrowRight} onPress={() => router.replace('/(tabs)/practice')} />
        }>
        <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        <HeroCard>
          <Text variant="title" color="onInk" accessibilityRole="header">
            Your answers are saved
          </Text>
          <Text variant="body" color="mutedOnInk">
            You&apos;re offline, so they&apos;re waiting on this phone. They&apos;ll be sent and marked as soon as
            you&apos;re back online, and your score will show in Practice.
          </Text>
        </HeroCard>
      </Screen>
    );
  }

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

  const typed = question.type === 'fill_blank' || written;
  const feedback = revealed && written ? marked?.feedback : undefined;
  const canContinue = mode === 'practice' ? Boolean(answered) : draft !== undefined && draft !== '';
  // One main action (DESIGN.md §7): in practice a typed answer is checked first, then the same pill moves on.
  const checking = mode === 'practice' && typed && !answered;
  const footer = checking ? (
    <ActionPill label="Check" icon={Check} onPress={() => record(text.trim())} disabled={!text.trim()} />
  ) : (
    <ActionPill
      label={last ? (mode === 'exam' ? 'Submit' : 'See results') : 'Next'}
      icon={last ? Check : ArrowRight}
      onPress={next}
      loading={submitting}
      disabled={!canContinue && !(mode === 'exam' && last)}
    />
  );

  const status =
    left !== null
      ? clock(left)
      : feedback
        ? `${index + 1} of ${questions.length}`
        : mode === 'exam'
          ? 'Exam mode'
          : null;

  return (
    <Screen footer={footer}>
      <View style={styles.topBar}>
        <IconButton icon={X} accessibilityLabel="Close quiz" onPress={() => router.back()} />
        {status ? (
          <Text
            variant="label"
            color={left !== null && left < 60 ? 'warning' : 'textSecondary'}
            accessibilityLabel={left !== null ? `Time left ${clock(left)}` : status}>
            {status}
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
            {written ? `${TYPE_LABELS[question.type]} · ${question.marks} marks` : TYPE_LABELS[question.type]}
          </Text>
          {feedback ? null : (
            <ProgressRing size={56} value={(index + 1) / questions.length} label={`${index + 1}/${questions.length}`} />
          )}
        </View>
        <Text variant="title" color="onInk" accessibilityRole="header">
          {question.stem}
        </Text>
        {feedback && marked?.score !== null && marked?.score !== undefined && feedback.status === 'marked' ? (
          <View style={styles.score} accessible accessibilityLabel={`${marksText(marked.score)} out of ${question.marks} marks`}>
            <Text variant="number" color="onInk" style={styles.scoreBig}>
              {marksText(marked.score)}
            </Text>
            <Text variant="heading" color="mutedOnInk">
              / {question.marks} marks
            </Text>
          </View>
        ) : waiting ? (
          <Text variant="label" color="mutedOnInk" accessibilityLiveRegion="polite">
            Marking your answer…
          </Text>
        ) : null}
      </HeroCard>

      {typed && !(written && revealed) ? (
        <View style={styles.options}>
          <TextField
            label="Your answer"
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (mode === 'exam') setDraft(t.trim() ? t : undefined);
            }}
            editable={!revealed}
            autoCapitalize={written ? 'sentences' : 'none'}
            autoCorrect={written}
            multiline={written}
            style={written ? styles.essay : undefined}
            returnKeyType={written ? 'default' : 'done'}
            onSubmitEditing={written ? undefined : () => mode === 'practice' && text.trim() && record(text.trim())}
          />
        </View>
      ) : typed ? null : (
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

      {waiting ? (
        <Text variant="body" color="textSecondary">
          Checking your answer against the marking scheme. If you&apos;re offline, it&apos;s marked when you reconnect.
        </Text>
      ) : null}

      {feedback ? <MarkedAnswer feedback={feedback} /> : null}

      {revealed && answered && !written ? (
        <View style={styles.feedback} accessibilityLiveRegion="polite">
          <Text variant="body">
            <Text variant="body" color={answered.correct ? 'success' : 'danger'} style={styles.verdict}>
              {answered.correct ? 'Correct. ' : 'Not quite. '}
            </Text>
            {!answered.correct && question.type === 'fill_blank' ? `The answer is "${answerText(question)}". ` : ''}
            {question.explanation}
          </Text>
        </View>
      ) : null}

      {revealed && (!written || feedback) ? (
        <View style={styles.chips}>
          {question.source_pages.slice(0, 3).map((p) => (
            <CitationChip
              key={p}
              page={p}
              onPress={() => router.push({ pathname: '/document/[id]/page/[n]', params: { id: data.document_id, n: String(p) } })}
            />
          ))}
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
  essay: { minHeight: 160, textAlignVertical: 'top' },
  score: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  scoreBig: { fontSize: 72, lineHeight: 76 },
  feedback: { gap: Spacing.two },
  verdict: { fontFamily: FontFamily.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  writing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  center: { textAlign: 'center' },
});
