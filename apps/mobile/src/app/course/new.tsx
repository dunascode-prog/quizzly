import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { AccentSwatches } from '@/components/ui/accent-swatches';
import { Banner } from '@/components/ui/banner';
import { DateField } from '@/components/ui/date-field';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { type AccentName, CourseAccentOrder, Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { useCourses, useCreateCourse } from '@/lib/library';

/** Length after folding runs of spaces, the way the API counts it. */
function codeLength(code: string) {
  return code.trim().replace(/\s+/g, ' ').length;
}

// New / edit course sheet (DESIGN.md §7): code 2–12 characters, optional title (FR-CRS-01),
// optional exam date for the countdown (FR-CRS-04) and the next accent in the rotation (FR-CRS-05).
export default function NewCourseSheet() {
  const create = useCreateCourse();
  const count = useCourses().data?.length ?? 0;
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState<string | null>(null);
  const [accent, setAccent] = useState<AccentName>(CourseAccentOrder[count % CourseAccentOrder.length]);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const n = codeLength(code);
    if (n < 2 || n > 12) {
      setError('Course codes are 2–12 characters, like "CSC 225".');
      return;
    }
    setError(null);
    create.mutate(
      { code, title: title.trim() || null, exam_date: examDate, accent },
      { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) },
    );
  };

  return (
    <Sheet title="New course" onClose={() => router.back()}>
      <View style={styles.fields}>
        <TextField
          label="Course code"
          value={code}
          onChangeText={setCode}
          placeholder="CSC 225"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={20}
          returnKeyType="next"
        />
        <TextField
          label="Title (optional)"
          value={title}
          onChangeText={setTitle}
          placeholder="Data Structures"
          autoCapitalize="words"
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={save}
        />
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
      <ActionPill label="Create course" icon={Check} onPress={save} loading={create.isPending} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: Spacing.twoHalf },
});
