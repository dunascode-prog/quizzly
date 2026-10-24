import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check, X } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { FontFamily, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Feedback, marksText } from '@/lib/quiz';

type Criterion = Feedback['criteria'][number];

/** One rubric point: ✓ when it earned marks, ✕ on dangerSoft with a hint when it didn't (DESIGN.md §7, 11). */
function RubricRow({ c, onSurface }: { c: Criterion; onSurface: boolean }) {
  const theme = useTheme();
  const missed = c.awarded === 0;
  const full = c.awarded >= c.marks;
  const Icon = missed ? X : Check;
  const hint = !full && Boolean(c.feedback);
  return (
    <View
      style={[styles.row, hint && styles.rowTop, { backgroundColor: missed ? theme.dangerSoft : onSurface ? theme.backgroundSelected : theme.backgroundElement }]}
      accessible
      accessibilityLabel={`${c.criterion}: ${marksText(c.awarded)} of ${c.marks} marks. ${full ? '' : c.feedback}`}>
      <Icon size={22} strokeWidth={2.4} color={missed ? theme.danger : full ? theme.success : theme.warning} />
      <View style={styles.rowText}>
        <Text variant="label">{c.criterion}</Text>
        {hint ? (
          <Text variant="small" color={missed ? 'danger' : 'textSecondary'}>
            {c.feedback}
          </Text>
        ) : null}
      </View>
      <Text variant="label" style={styles.marks}>
        {marksText(c.awarded)}/{c.marks}
      </Text>
    </View>
  );
}

type Props = {
  feedback: Feedback;
  /** Review shows the model answer straight away; the question screen hides it behind a link. */
  showModelAnswer?: boolean;
  /** Inside a card: rows take the selected tone so they stand out from it. */
  onSurface?: boolean;
};

/** Per-criterion marks, the marker's summary and the model answer for a written answer (FR-QUIZ-04). */
export function MarkedAnswer({ feedback, showModelAnswer = false, onSurface = false }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(showModelAnswer);
  const notMarked = feedback.status === 'not_marked';
  return (
    <View style={styles.root}>
      {notMarked ? <Banner tone={feedback.reason === 'limit' ? 'warning' : 'info'} message={feedback.summary} /> : null}
      {feedback.criteria.map((c, i) => (
        <RubricRow key={i} c={c} onSurface={onSurface} />
      ))}
      {!notMarked && feedback.summary ? (
        <Text variant="body" color="textSecondary">
          {feedback.summary}
        </Text>
      ) : null}
      {feedback.model_answer ? (
        open || notMarked ? (
          <View style={[styles.model, { backgroundColor: theme.backgroundSelected }]}>
            <Text variant="caption" color="textSecondary">
              Model answer
            </Text>
            <Text variant="body">{feedback.model_answer}</Text>
          </View>
        ) : (
          <TextButton label="See model answer" onPress={() => setOpen(true)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.twoHalf },
  row: {
    minHeight: Size.field,
    borderRadius: Radius.option + 2,
    paddingHorizontal: Spacing.gutter - 2,
    paddingVertical: Spacing.twoHalf,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  rowTop: { alignItems: 'flex-start' },
  rowText: { flex: 1, gap: Spacing.half },
  marks: { fontFamily: FontFamily.semibold },
  model: { borderRadius: Radius.option + 2, padding: Spacing.gutter - 2, gap: Spacing.one },
});
