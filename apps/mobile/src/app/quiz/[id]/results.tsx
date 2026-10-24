import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RotateCw, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { MaxContentWidth, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { createQuiz, useAttempt, useQuiz } from '@/lib/quiz';

function minutes(start: string, end: string | null) {
  if (!end) return null;
  const m = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return plural(m, 'min');
}

// Screen 12 (DESIGN.md §7): score, time, and the weakest topics to revise (FR-QUIZ-06/07).
export default function ResultsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { id, attempt: attemptId } = useLocalSearchParams<{ id: string; attempt: string }>();
  const attempt = useAttempt(attemptId);
  const quiz = useQuiz(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const a = attempt.data;
  const pct = a && a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : 0;
  const weakest = a?.weakest ?? [];

  const practise = async () => {
    if (!quiz.data || !weakest.length) return;
    setBusy(true);
    setError(null);
    try {
      const next = await createQuiz(quiz.data.document_id, {
        topic_ids: weakest.map((t) => t.topic_id),
        types: ['mcq', 'true_false', 'fill_blank'],
        difficulty: 'mixed',
        count: 5,
        mode: 'practice',
      });
      router.replace({ pathname: '/quiz/[id]/play', params: { id: next.id, mode: 'practice' } });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.text }]}>
      <StatusBar style={scheme === 'dark' ? 'dark' : 'light'} />
      <SafeAreaView edges={['top']} style={styles.inner}>
        <IconButton icon={X} accessibilityLabel="Close results" onPress={() => router.back()} />
        <View style={styles.hero} accessible accessibilityLabel={a ? `Score ${pct} percent` : 'Loading score'}>
          <ProgressRing size={168} strokeWidth={10} value={pct / 100} label={a ? `${pct}%` : '…'} />
          <Text variant="title" color="onInk" style={styles.center}>
            {a?.title ?? ' '}
          </Text>
          <Text variant="body" color="mutedOnInk">
            {a
              ? [plural(quiz.data?.questions.length ?? a.answers.length, 'question'), minutes(a.started_at, a.submitted_at)]
                  .filter(Boolean)
                  .join(' · ')
              : ' '}
          </Text>
        </View>
      </SafeAreaView>

      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={[styles.inner, styles.sheetBody]}>
          {attempt.isError ? <Banner message={friendlyError(attempt.error)} /> : null}
          <Text variant="title" accessibilityRole="header">
            {weakest.length ? 'Revise next' : 'Well done'}
          </Text>
          {weakest.length === 0 && a ? (
            <Text variant="body" color="textSecondary">
              You got every question right. Try a harder quiz or a new set of questions.
            </Text>
          ) : null}
          {weakest.map((t) => {
            const p = t.max ? Math.round((t.score / t.max) * 100) : 0;
            return (
              <View
                key={t.topic_id}
                style={[styles.row, { backgroundColor: theme.backgroundSelected }]}
                accessible
                accessibilityLabel={`${t.title ?? 'Topic'}: ${p} percent`}>
                <Text variant="label" style={styles.flex}>
                  {t.title ?? 'Topic'}
                </Text>
                <Text variant="label" color={p < 50 ? 'danger' : 'warning'}>
                  {p}%
                </Text>
              </View>
            );
          })}
          {error ? <Banner message={error} /> : null}
          <View style={styles.actions}>
            {weakest.length ? <ActionPill label="Practise these" icon={RotateCw} onPress={practise} loading={busy} /> : null}
            <TextButton
              label="Review answers"
              onPress={() => router.push({ pathname: '/quiz/[id]/review', params: { id, attempt: attemptId } })}
            />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter, gap: Spacing.three },
  hero: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.five },
  center: { textAlign: 'center' },
  sheet: { flex: 1, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, overflow: 'hidden' },
  sheetBody: { paddingTop: Spacing.four, paddingBottom: Spacing.six },
  row: {
    minHeight: Size.field - 8,
    borderRadius: Radius.option + 2,
    paddingHorizontal: Spacing.gutter - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: { flex: 1 },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
