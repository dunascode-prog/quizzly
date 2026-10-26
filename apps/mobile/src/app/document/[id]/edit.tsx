import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { type Doc, useCourses, useDeleteDocument, useUpdateDocument } from '@/lib/library';

/** The document as last listed, from whichever course/Unfiled list holds it. */
function useCachedDoc(id: string): Doc | undefined {
  const client = useQueryClient();
  for (const [, list] of client.getQueriesData<Doc[]>({ queryKey: ['documents'] })) {
    const found = list?.find((d) => d.id === id);
    if (found) return found;
  }
  return undefined;
}

// Rename, move or delete a document (FR-DOC-09, FR-CRS-02).
export default function EditDocumentSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useCachedDoc(id);
  const courses = useCourses();
  const update = useUpdateDocument(id);
  const remove = useDeleteDocument(id);
  const [title, setTitle] = useState(doc?.title ?? '');
  const [courseId, setCourseId] = useState<string | null>(doc?.course_id ?? null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    update.mutate(
      { title: title.trim(), course_id: courseId },
      { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) },
    );
  };

  const del = () => {
    setError(null);
    remove.mutate(undefined, { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) });
  };

  return (
    <Sheet title="Document" onClose={() => router.back()}>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={80} />
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Course">
        <Text variant="label">Course</Text>
        <View style={styles.pills}>
          {courses.data?.map((c) => (
            <Pill key={c.id} label={c.code} role="radio" selected={courseId === c.id} onPress={() => setCourseId(c.id)} />
          ))}
          <Pill label="No course" role="radio" selected={courseId === null} onPress={() => setCourseId(null)} />
        </View>
      </View>
      {error ? <Banner message={error} /> : null}
      <ActionPill label="Save" icon={Check} onPress={save} loading={update.isPending} disabled={!title.trim()} />

      {confirming ? (
        <View style={styles.group} accessibilityLiveRegion="polite">
          <Text variant="body">This also deletes its quizzes and chats. It can&apos;t be undone.</Text>
          <View style={styles.pills}>
            <Pill label="Delete document" onPress={del} />
            <Pill label="Cancel" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <TextButton label="Delete document" color="danger" onPress={() => setConfirming(true)} disabled={remove.isPending} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.twoHalf },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
