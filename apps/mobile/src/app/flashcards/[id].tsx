import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArrowRight, Flag, RotateCw, X } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Flashcard, RatingPills } from '@/components/ui/flashcard';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { enqueue, flush, isPending } from '@/lib/outbox';
import { type Attempt, answerText, type Question, useQuiz, useStartAttempt } from '@/lib/quiz';
import { useOutline } from '@/lib/study';

type Rating = { id: string; knew: boolean };

const SHOWN_MISSED = 3;

function Header({ code, title, reportId }: { code: string | null | undefined; title: string; reportId?: string }) {
  return (
    <View style={styles.header}>
      <IconButton icon={X} accessibilityLabel="Close flashcards" onPress={() => router.back()} />
      <View style={styles.headerText}>
        <Text variant="small" color="textSecondary" numberOfLines={1}>
          {code ? `Flashcards · ${code}` : 'Flashcards'}
        </Text>
        <Text variant="label" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {reportId ? (
        <IconButton
          icon={Flag}
          accessibilityLabel="Report this card"
          onPress={() => router.push({ pathname: '/report', params: { targetId: reportId, targetType: 'question' } })}
        />
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

function PageChip({ page }: { page: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.pageChip, { borderColor: theme.text }]}>
      <Text variant="label">p. {page}</Text>
    </View>
  );
}

// Screen 25 (DESIGN.md §7, FR-QGEN-10): flip a card, rate yourself, next. Ratings are the round's
// answers, saved through the outbox like any quiz (FR-OFF-02); missed cards go to the review queue
// and come back in the Daily 5.
export default function FlashcardsScreen() {
  const theme = useTheme();
  const { id, attempt: resumeId, only } = useLocalSearchParams<{ id: string; attempt?: string; only?: string }>();
  const quiz = useQuiz(id);
  const start = useStartAttempt(id);
  const [attemptId] = useState(() => resumeId ?? randomUUID());
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [done, setDone] = useState(false);
  const [queued, setQueued] = useState(false);
  const [offline, setOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const data = quiz.data;
  const outline = useOutline(data?.document_id ?? '');
  const code = outline.data?.document.course_code;
  const subset = only ? new Set(only.split(',')) : null;
  const cards: Question[] = (data?.questions ?? []).filter((q) => !subset || subset.has(q.id));
  const ready = data?.status === 'ready' && cards.length > 0;
  const card = cards[index];
  const last = index === cards.length - 1;
  const begun = start.isSuccess || offline;

  const restore = (a: Attempt) => {
    const back: Record<string, Rating> = {};
    for (const x of a.answers) if (typeof x.response === 'boolean') back[x.question_id] = { id: randomUUID(), knew: x.response };
    setRatings(back);
    if (a.status !== 'in_progress') {
      setDone(true);
      return;
    }
    const next = cards.findIndex((c) => !back[c.id]);
    setIndex(next === -1 ? Math.max(cards.length - 1, 0) : next);
  };

  useEffect(() => {
    if (!ready || !start.isIdle) return;
    start.mutate(
      { id: attemptId, mode: 'practice' },
      {
        onSuccess: (a) => {
          restore(a);
          void flush();
        },
        onError: (e) => {
          if (e instanceof ApiError || resumeId) return;
          setOffline(true); // play from the saved cards; the start waits in the outbox
          void enqueue({ kind: 'start', attemptId, quizId: id, mode: 'practice' });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, start, attemptId]);

  const rate = (knew: boolean) => {
    if (!card) return;
    const rating = { id: ratings[card.id]?.id ?? randomUUID(), knew };
    setRatings((r) => ({ ...r, [card.id]: rating }));
    setFlipped(true); // choosing also shows the answer
    const sent = enqueue({
      kind: 'answers',
      attemptId,
      answers: [{ id: rating.id, question_id: card.id, response: knew }],
      currentIndex: index,
    });
    if (begun) void sent.then(flush);
  };

  // The summary comes from the ratings on this phone, so it shows at once; the round is sent in
  // the background (or when the phone reconnects) and the banner says if it's still waiting.
  const finish = async () => {
    setSubmitting(true);
    const answers = cards
      .filter((c) => ratings[c.id])
      .map((c) => ({ id: ratings[c.id].id, question_id: c.id, response: ratings[c.id].knew }));
    await enqueue({ kind: 'submit', attemptId, answers });
    setSubmitting(false);
    setDone(true);
    await flush();
    setQueued(isPending(attemptId));
  };

  const next = () => {
    if (last) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setFlipped(false);
  };

  if (!data || !ready) {
    return (
      <Screen>
        <Header code={code} title={data?.title ?? ''} />
        {quiz.isError ? (
          <Banner message={friendlyError(quiz.error)} />
        ) : data?.status === 'failed' || (data?.status === 'ready' && !cards.length) ? (
          <Banner message="We couldn't make flashcards from this topic. Go back and try again; it won't use up your daily limit." />
        ) : (
          <View style={styles.writing} accessibilityLiveRegion="polite">
            {data?.busy ? (
              <Banner tone="warning" message="High demand — your cards are queued. We'll keep trying, and you can close the app." />
            ) : null}
            <ProgressRing
              size={96}
              strokeWidth={6}
              value={Math.max(data?.progress ?? 0, 5) / 100}
              label={`${Math.max(data?.progress ?? 0, 5)}%`}
              color="text"
              trackColor="line"
            />
            <Text variant="title" style={styles.center}>
              Making your flashcards
            </Text>
            <Text variant="body" color="textSecondary" style={styles.center}>
              They come from your own notes. This usually takes under 30 seconds; you can leave and come back.
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  const known = cards.filter((c) => ratings[c.id]?.knew).length;
  const missedCards = cards.filter((c) => ratings[c.id] && !ratings[c.id].knew);
  const missed = missedCards.length;

  if (done) {
    const rated = known + missed;
    const total = rated || cards.length;
    const share = total ? known / total : 0;
    const footer = missed ? (
      <>
        <ActionPill
          label={`Review the ${missed} you missed`}
          icon={RotateCw}
          onPress={() => router.replace({ pathname: '/flashcards/[id]', params: { id, only: missedCards.map((c) => c.id).join(',') } })}
        />
        <TextButton label="Back to topic" onPress={() => router.back()} />
      </>
    ) : (
      <ActionPill label="Back to topic" icon={ArrowRight} onPress={() => router.back()} />
    );
    return (
      <Screen footer={footer}>
        <Header code={code} title={data.title} />
        <HighlightText highlight="done">Round done</HighlightText>
        <HeroCard style={styles.summary}>
          <ProgressRing size={96} strokeWidth={6} value={share} label={`${Math.round(share * 100)}%`} />
          <View style={styles.flex}>
            <Text variant="title" color="onInk">
              {known} of {total} known
            </Text>
            <Text variant="body" color="mutedOnInk">
              {missed
                ? `The ${missed} you missed will come back in your Daily 5.`
                : 'You knew every card. They’ll still come back now and then, so they stay fresh.'}
            </Text>
          </View>
        </HeroCard>
        {queued ? <Banner tone="info" message="You're offline. Your ratings are saved on this phone and will be sent when you reconnect." /> : null}
        {missed ? (
          <View style={styles.list}>
            <Text variant="label">Cards to go over</Text>
            {missedCards.slice(0, SHOWN_MISSED).map((c) => (
              <View
                key={c.id}
                style={[styles.missedRow, { backgroundColor: theme.backgroundElement }]}
                accessible
                accessibilityLabel={`${c.stem}. Answer: ${answerText(c)}. Page ${c.source_pages[0]}`}>
                <Text variant="body" style={styles.flex}>
                  {c.stem}
                </Text>
                <PageChip page={c.source_pages[0]} />
              </View>
            ))}
            {missed > SHOWN_MISSED ? (
              <Text variant="small" color="textSecondary">
                + {missed - SHOWN_MISSED} more
              </Text>
            ) : null}
          </View>
        ) : null}
      </Screen>
    );
  }

  const rating = ratings[card.id];
  return (
    <Screen
      fit
      footer={<ActionPill label={last ? 'Finish round' : 'Next card'} icon={ArrowRight} onPress={next} loading={submitting} disabled={!rating} />}>
      <Header code={code} title={data.title} reportId={card.id} />
      <HighlightText highlight="recall">Flip and recall</HighlightText>
      <View style={styles.progress} accessible accessibilityLabel={`Card ${index + 1} of ${cards.length}. ${known} known, ${missed} missed`}>
        <View style={styles.progressText}>
          <Text variant="label">
            {index + 1} of {cards.length}
          </Text>
          <Text variant="small" color="textSecondary">
            {known} known · {missed} missed
          </Text>
        </View>
        <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.barFill, { backgroundColor: theme.text, width: `${((index + 1) / cards.length) * 100}%` }]} />
        </View>
      </View>
      <Flashcard
        key={card.id}
        front={card.stem}
        back={answerText(card)}
        extra={card.explanation}
        page={card.source_pages[0]}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        onPage={(n) => router.push({ pathname: '/document/[id]/page/[n]', params: { id: data.document_id, n: String(n) } })}
      />
      <RatingPills value={rating?.knew} onRate={rate} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerText: { flex: 1, alignItems: 'center' },
  spacer: { width: 52 },
  progress: { gap: Spacing.two },
  progressText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  bar: { height: 6, borderRadius: Radius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.full },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  list: { gap: Spacing.two },
  missedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, paddingLeft: Spacing.gutter, borderRadius: Radius.option },
  pageChip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: Spacing.twoHalf, minHeight: 36, justifyContent: 'center' },
  writing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  center: { textAlign: 'center' },
});
