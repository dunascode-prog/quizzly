import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArrowRight, Lock, RotateCcw, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Text } from '@/components/ui/text';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useCourses } from '@/lib/library';
import { createQuiz, type Difficulty, type Mode, type PaperStyle, type QuestionType, usePaperStyles } from '@/lib/quiz';
import { useMe } from '@/lib/profile';
import { useOutline } from '@/lib/study';

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'fill_blank', label: 'Fill the blank' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'theory', label: 'Theory' },
];
const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];
const COUNTS = [5, 10, 20, 30] as const;
const FREE_COUNTS: readonly number[] = [5, 10]; // 20 and 30 are on Student and Premium (FR-PLAN-04)
const TIMERS = [0, 10, 20, 30, 60] as const; // minutes; 0 = no timer

const yearOf = (s: PaperStyle) => (s.year && s.year !== 'older' ? s.year : 'an older');

/** Screen 26b: the past paper this quiz copies (FR-QGEN-09). */
function StyleCard({ code, style, onChange }: { code: string; style: PaperStyle; onChange: () => void }) {
  const theme = useTheme();
  return (
    <HeroCard>
      <View style={styles.styleTop}>
        <View style={[styles.styleIcon, { backgroundColor: theme.onInk }]}>
          <RotateCcw size={24} color={theme.text} />
        </View>
        <View style={styles.flex}>
          <Text variant="small" color="mutedOnInk">
            Style
          </Text>
          <Text variant="heading" color="onInk">
            Past questions ({code}, {style.year && style.year !== 'older' ? style.year : 'older'})
          </Text>
        </View>
        <Pill label="Change" onPress={onChange} accessibilityLabel="Change the quiz style" />
      </View>
      <Text variant="small" color="mutedOnInk">
        Same format as {style.year && style.year !== 'older' ? `the ${style.year}` : 'that'} paper. Every answer comes from your notes.
      </Text>
    </HeroCard>
  );
}

function CountCircle({
  n,
  selected,
  locked,
  onPress,
}: {
  n: number;
  selected: boolean;
  locked?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${n} questions${locked ? ', on Student and Premium' : ''}`}
      accessibilityHint={locked ? 'Opens the plans' : undefined}
      style={[styles.circle, { backgroundColor: selected ? theme.text : theme.backgroundSelected }]}>
      <Text variant="title" color={selected ? 'onInk' : locked ? 'textSecondary' : 'text'}>
        {n}
      </Text>
      {/* A paid-plan size for a free student (FR-PLAN-04). */}
      {locked ? (
        <View style={[styles.lock, { backgroundColor: theme.text, borderColor: theme.background }]}>
          <Lock size={12} color={theme.onInk} strokeWidth={2.5} />
        </View>
      ) : null}
    </Pressable>
  );
}

// Screen 09 (DESIGN.md §7): scope, types, count and mode (FR-QGEN-01; defaults whole document,
// multiple choice, mixed, 10). Short answer and theory are marked by the AI; exams may be timed.
export default function QuizSetup() {
  const theme = useTheme();
  const { documentId, topicId } = useLocalSearchParams<{ documentId: string; topicId?: string }>();
  const outline = useOutline(documentId);
  const topics = outline.data?.topics ?? [];
  const [topicIds, setTopicIds] = useState<string[]>(topicId ? [topicId] : []);
  const [types, setTypes] = useState<QuestionType[]>(['mcq']);
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [count, setCount] = useState<(typeof COUNTS)[number]>(topicId ? 5 : 10);
  const [mode, setMode] = useState<Mode>('practice');
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Past-question style (FR-QGEN-09): only for the student's own courses.
  const courseId = outline.data?.document.course_id ?? null;
  const course = useCourses().data?.find((c) => c.id === courseId);
  const own = Boolean(course && !course.shared_by);
  const paperStyles = usePaperStyles(own ? courseId : null).data ?? [];
  const ready = paperStyles.filter((p) => p.status === 'ready');
  const learning = paperStyles.some((p) => p.status === 'pending' || p.status === 'generating');
  const [styleId, setStyleId] = useState<string | null>(null);
  // Free students see paid options with a padlock that opens the plans (FR-PLAN-04).
  const plan = useMe().data?.plan ?? 'free';
  const free = plan === 'free';
  const toPlans = () => router.push('/plans');
  const [picking, setPicking] = useState(false);
  const [editTypes, setEditTypes] = useState(false);
  const chosen = ready.find((p) => p.id === styleId);
  const pickStyle = (p: PaperStyle | null) => {
    setPicking(false);
    setEditTypes(false);
    setStyleId(p?.id ?? null);
    if (p) {
      setTypes(p.question_types.length ? p.question_types : ['theory']);
      setMode('exam'); // a past paper is practised like the exam (26b)
    }
  };
  const addPaper = () => courseId && router.push({ pathname: '/course/[id]/past-paper', params: { id: courseId } });

  const scope =
    topicIds.length === 0 || topicIds.length === topics.length
      ? 'All topics'
      : topicIds.length === 1
        ? (topics.find((t) => t.id === topicIds[0])?.title ?? '1 topic')
        : `${topicIds.length} topics`;
  const level = DIFFICULTIES.find((d) => d.value === difficulty)!.label;

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const quiz = await createQuiz(documentId, {
        topic_ids: topicIds,
        types,
        difficulty,
        count,
        mode,
        ...(mode === 'exam' && timer ? { time_limit_min: timer } : {}),
        ...(chosen ? { style_id: chosen.id } : {}),
      });
      router.replace({ pathname: '/quiz/[id]/play', params: { id: quiz.id, mode } });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionPill
          label={`Start ${count} questions`}
          icon={ArrowRight}
          onPress={start}
          loading={busy}
          disabled={types.length === 0}
        />
      }>
      <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
      <HighlightText highlight="quiz">Build a quiz</HighlightText>

      <View style={styles.scopeRow}>
        <Text variant="body" color="textSecondary" style={styles.flex}>
          {scope} · {level} difficulty
        </Text>
        <Pill label={changing ? 'Done' : 'Change'} onPress={() => setChanging((c) => !c)} />
      </View>

      {changing ? (
        <View style={styles.group}>
          <Text variant="label">Topics</Text>
          <View style={styles.pills}>
            <Pill label="All topics" role="radio" selected={topicIds.length === 0} onPress={() => setTopicIds([])} />
            {topics.map((t) => (
              <Pill
                key={t.id}
                label={t.title}
                role="checkbox"
                selected={topicIds.includes(t.id)}
                onPress={() => setTopicIds((ids) => toggle(ids, t.id))}
              />
            ))}
          </View>
          <Text variant="label">Difficulty</Text>
          <View style={styles.pills}>
            {DIFFICULTIES.map((d) => (
              <Pill key={d.value} label={d.label} role="radio" selected={difficulty === d.value} onPress={() => setDifficulty(d.value)} />
            ))}
          </View>
        </View>
      ) : null}

      {own && chosen && !picking ? <StyleCard code={course?.code ?? ''} style={chosen} onChange={() => setPicking(true)} /> : null}
      {own && (!chosen || picking) ? (
        <View style={styles.group}>
          <Text variant="label">Style</Text>
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel="Quiz style">
            <Pill label="From my notes" role="radio" selected={!chosen} onPress={() => pickStyle(null)} />
            {ready.map((p) => (
              <Pill
                key={p.id}
                label={`Like the ${p.year && p.year !== 'older' ? p.year : 'older'} paper`}
                role="radio"
                selected={chosen?.id === p.id}
                locked={free}
                onPress={() => (free ? toPlans() : pickStyle(p))}
              />
            ))}
            <Pill label="+ Past paper" accessibilityLabel="Add a past paper" locked={free} onPress={free ? toPlans : addPaper} />
          </View>
          <Text variant="small" color="textSecondary">
            {learning
              ? "We're learning your past paper's style. It'll show here in a minute."
              : ready.length
                ? `Copy the question types, wording and marks of ${yearOf(ready[0])} paper. Every answer still comes from your notes.`
                : 'Add a past paper and new questions copy its style, using only your notes.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.group}>
        <Text variant="label">Question types</Text>
        {chosen && !editTypes ? (
          <View style={[styles.matches, { backgroundColor: theme.backgroundElement }]}>
            <Text variant="body" style={styles.flex}>
              Matches the paper:{' '}
              <Text variant="label">{types.map((t) => TYPES.find((x) => x.value === t)?.label ?? t).join(', ')}</Text>
            </Text>
            <Pill label="Edit" onPress={() => setEditTypes(true)} accessibilityLabel="Edit question types" />
          </View>
        ) : (
          <View style={styles.pills}>
            {TYPES.map((t) => (
              <Pill
                key={t.value}
                label={t.label}
                role="checkbox"
                selected={types.includes(t.value)}
                onPress={() => setTypes((list) => toggle(list, t.value))}
              />
            ))}
          </View>
        )}
        {types.some((t) => t === 'short_answer' || t === 'theory') ? (
          <Text variant="small" color="textSecondary">
            Written answers are marked by AI against a marking scheme from your notes.
          </Text>
        ) : null}
      </View>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Number of questions">
        <Text variant="label">Questions</Text>
        <View style={styles.counts}>
          {COUNTS.map((n) => {
            const locked = free && !FREE_COUNTS.includes(n);
            return (
              <CountCircle key={n} n={n} selected={count === n} locked={locked} onPress={() => (locked ? toPlans() : setCount(n))} />
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="label">Mode</Text>
        <SegmentedPill
          options={[
            { value: 'practice' as Mode, label: 'Practice' },
            { value: 'exam' as Mode, label: 'Exam' },
          ]}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Mode"
        />
        <Text variant="small" color="textSecondary">
          {mode === 'practice' ? 'See the answer after each question.' : 'Answers and feedback come at the end.'}
        </Text>
      </View>

      {mode === 'exam' ? (
        <View style={styles.group}>
          <Text variant="label">Timer</Text>
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel="Timer">
            {TIMERS.map((m) => (
              <Pill
                key={m}
                label={m ? `${m} min` : 'No timer'}
                role="radio"
                selected={timer === m}
                locked={free && m > 0}
                onPress={() => (free && m > 0 ? toPlans() : setTimer(m))}
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
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: -Spacing.two },
  flex: { flex: 1 },
  group: { gap: Spacing.twoHalf },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  counts: { flexDirection: 'row', justifyContent: 'space-between' },
  circle: { width: 72, height: 72, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  styleTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  styleIcon: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  matches: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, paddingLeft: Spacing.gutter, borderRadius: Radius.option },
});
