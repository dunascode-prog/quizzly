import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArrowRight, ChevronLeft, Flag, RotateCw, ThumbsDown, ThumbsUp } from '@/components/icons';
import { Markdown } from '@/components/markdown';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useMe } from '@/lib/profile';
import { type Style, useExplanation, useOutline, useRateExplanation } from '@/lib/study';

const STYLES: { value: Style; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'simple', label: 'Simple' },
  { value: 'exam', label: 'Exam' },
];

function Writing() {
  const theme = useTheme();
  return (
    <View style={styles.writing} accessibilityLiveRegion="polite" accessibilityLabel="Writing your explanation">
      {[92, 100, 76, 100, 64].map((w, i) => (
        <View key={i} style={[styles.skeletonLine, { width: `${w}%`, backgroundColor: theme.backgroundElement }]} />
      ))}
      <Text variant="small" color="textSecondary">
        Writing your explanation from your notes. This takes about 10 seconds.
      </Text>
    </View>
  );
}

// Screen 07 (DESIGN.md §7): one topic explained in three styles, citing pages (FR-EXPL-01..05).
export default function ExplanationScreen() {
  const theme = useTheme();
  const { id, topicId } = useLocalSearchParams<{ id: string; topicId: string }>();
  const me = useMe();
  const [style, setStyle] = useState<Style>(me.data?.explanation_style ?? 'standard');
  const outline = useOutline(id);
  const explanation = useExplanation(id, topicId, style);
  const rate = useRateExplanation();
  const [rated, setRated] = useState<Record<string, 1 | -1>>({});

  const topics = outline.data?.topics ?? [];
  const index = topics.findIndex((t) => t.id === topicId);
  const topic = topics[index];
  const next = index >= 0 ? topics[index + 1] : undefined;
  const ex = explanation.data;
  const ready = ex?.status === 'ready' && ex.content_md;

  const openPage = (page: number) => router.push({ pathname: '/document/[id]/page/[n]', params: { id, n: String(page) } });
  const thumbs = (rating: 1 | -1) => {
    if (!ex) return;
    setRated((r) => ({ ...r, [ex.id]: rating }));
    rate.mutate({ target_id: ex.id, rating });
  };

  // "Quiz me on this" arrives with quizzes (M3); until then the main action moves on (DESIGN.md §7, 07).
  const footer = next ? (
    <ActionPill
      label="Next topic"
      icon={ArrowRight}
      onPress={() => router.replace({ pathname: '/document/[id]/topic/[topicId]', params: { id, topicId: next.id } })}
      accessibilityHint={next.title}
    />
  ) : (
    <ActionPill label="Back to topics" icon={ChevronLeft} variant="light" onPress={() => router.back()} />
  );

  return (
    <Screen footer={footer}>
      <View style={styles.topBar}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text variant="small" color="textSecondary" style={styles.position}>
          {index >= 0 ? `Topic ${index + 1} of ${topics.length}` : ''}
        </Text>
        <IconButton
          icon={Flag}
          accessibilityLabel="Report this explanation"
          disabled={!ready}
          onPress={() => ex && router.push({ pathname: '/report', params: { targetId: ex.id } })}
        />
      </View>

      <Text variant="display" accessibilityRole="header">
        {topic?.title ?? ' '}
      </Text>

      <SegmentedPill options={STYLES} value={style} onChange={setStyle} accessibilityLabel="Explanation style" />

      {explanation.isError ? (
        <View style={styles.gap}>
          <Banner message={friendlyError(explanation.error)} />
          <ActionPill label="Try again" icon={RotateCw} variant="light" onPress={() => explanation.refetch()} />
        </View>
      ) : ex?.status === 'failed' ? (
        <View style={styles.gap}>
          <Banner message="We couldn't write this explanation. Try again; it won't use up your daily limit." />
          <ActionPill label="Try again" icon={RotateCw} variant="light" onPress={() => explanation.refetch()} />
        </View>
      ) : ready ? (
        <>
          <Markdown content={ex.content_md!} onCite={openPage} />
          <View style={[styles.feedback, { borderColor: theme.line }]}>
            <Text variant="small" color="textSecondary" style={styles.feedbackText}>
              Was this helpful?
            </Text>
            <IconButton
              icon={ThumbsUp}
              tone={rated[ex.id] === 1 ? 'ink' : 'light'}
              accessibilityLabel={rated[ex.id] === 1 ? 'Marked helpful' : 'Helpful'}
              onPress={() => thumbs(1)}
            />
            <IconButton
              icon={ThumbsDown}
              tone={rated[ex.id] === -1 ? 'ink' : 'light'}
              accessibilityLabel={rated[ex.id] === -1 ? 'Marked not helpful' : 'Not helpful'}
              onPress={() => thumbs(-1)}
            />
          </View>
        </>
      ) : (
        <Writing />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  position: { flex: 1, textAlign: 'center' },
  gap: { gap: Spacing.three },
  writing: { gap: Spacing.twoHalf },
  skeletonLine: { height: 18, borderRadius: 6 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.three },
  feedbackText: { flex: 1 },
});
