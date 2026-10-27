import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { AccentSwatches } from '@/components/ui/accent-swatches';
import { Banner } from '@/components/ui/banner';
import { DateField } from '@/components/ui/date-field';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { TextField } from '@/components/ui/text-field';
import { type AccentName, Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { useCourses, useDeleteCourse, useUpdateCourse } from '@/lib/library';

// Rename, set the exam date and accent, or delete a course (FR-CRS-01, 03, 04, 05).
export default function EditCourseSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = useCourses().data?.find((c) => c.id === id);
  const update = useUpdateCourse(id);
  const remove = useDeleteCourse(id);
  const [code, setCode] = useState(course?.code ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [examDate, setExamDate] = useState<string | null>(course?.exam_date ?? null);
  const [accent, setAccent] = useState<AccentName>(course?.accent ?? 'lagoon');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    update.mutate(
      { code, title: title.trim() || null, exam_date: examDate, accent },
      { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) },
    );
  };

  const deleteCourse = (documents: 'delete' | 'unfile') => {
    setError(null);
    remove.mutate(documents, {
      onSuccess: () => router.dismissTo('/'),
      onError: (e) => setError(friendlyError(e)),
    });
  };

  const docs = course?.document_count ?? 0;

  return (
    <Sheet title="Course" onClose={() => router.back()}>
      <View style={styles.fields}>
        <TextField label="Course code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={20} />
        <TextField label="Title (optional)" value={title} onChangeText={setTitle} autoCapitalize="words" maxLength={80} />
        <DateField
          label="Exam date (optional)"
          value={examDate}
          onChange={setExamDate}
          placeholder="Add exam date for a countdown"
          minimumDate={new Date()}
        />
        <AccentSwatches value={accent} onChange={setAccent} />
      </View>
      {error ? <Banner message={error} /> : null}
      <ActionPill label="Save" icon={Check} onPress={save} loading={update.isPending} />

      {confirming ? (
        <View style={styles.confirm} accessibilityLiveRegion="polite">
          <Text variant="body">
            {docs > 0 ? `What should happen to its ${docs} document${docs === 1 ? '' : 's'}?` : 'Delete this course?'}
          </Text>
          <View style={styles.pills}>
            {docs > 0 ? (
              <>
                <Pill label="Move to Unfiled" onPress={() => deleteCourse('unfile')} />
                <Pill label="Delete documents" onPress={() => deleteCourse('delete')} />
              </>
            ) : (
              <Pill label="Delete course" onPress={() => deleteCourse('unfile')} />
            )}
            <Pill label="Cancel" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <TextButton label="Delete course" color="danger" onPress={() => setConfirming(true)} disabled={remove.isPending} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: Spacing.twoHalf },
  confirm: { gap: Spacing.twoHalf },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
