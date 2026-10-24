import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArrowRight, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { createQuiz, type Difficulty, type Mode, type QuestionType } from '@/lib/quiz';
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
const TIMERS = [0, 10, 20, 30, 60] as const; // minutes; 0 = no timer

function CountCircle({ n, selected, onPress }: { n: number; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${n} questions`}
      style={[styles.circle, { backgroundColor: selected ? theme.text : theme.backgroundSelected }]}>
      <Text variant="title" color={selected ? 'onInk' : 'text'}>
        {n}
      </Text>
    </Pressable>
  );
}

// Screen 09 (DESIGN.md §7): scope, types, count and mode (FR-QGEN-01; defaults whole document,
// multiple choice, mixed, 10). Short answer and theory are marked by the AI; exams may be timed.
export default function QuizSetup() {
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

      <View style={styles.group}>
        <Text variant="label">Question types</Text>
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
        {types.some((t) => t === 'short_answer' || t === 'theory') ? (
          <Text variant="small" color="textSecondary">
            Written answers are marked by AI against a marking scheme from your notes.
          </Text>
        ) : null}
      </View>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Number of questions">
        <Text variant="label">Questions</Text>
        <View style={styles.counts}>
          {COUNTS.map((n) => (
            <CountCircle key={n} n={n} selected={count === n} onPress={() => setCount(n)} />
          ))}
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
              <Pill key={m} label={m ? `${m} min` : 'No timer'} role="radio" selected={timer === m} onPress={() => setTimer(m)} />
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
});
