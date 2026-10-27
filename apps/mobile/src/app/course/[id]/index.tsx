import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft, Ellipsis, Plus } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { IconButton } from '@/components/ui/icon-button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { formatDay, plural } from '@/lib/format';
import { type Doc, type DocScope, retryUpload, useCourses, useDocuments, useUploads } from '@/lib/library';

type Line = { text: string; color?: ThemeColor; action?: { label: string; onPress: () => void } };

/** One-line status under each document (DESIGN.md §7, 05). */
function statusLine(doc: Doc, upload: { progress: number; failed: boolean; problem?: string } | undefined): Line {
  if (upload?.problem) return { text: upload.problem, color: 'danger', action: { label: 'Retry', onPress: () => retryUpload(doc.id) } };
  if (upload?.failed) return { text: 'Upload paused', color: 'warning', action: { label: 'Retry', onPress: () => retryUpload(doc.id) } };
  if (upload) return { text: `Uploading · ${Math.round(upload.progress * 100)}%` };
  switch (doc.status) {
    case 'awaiting_upload':
      return { text: "The upload didn't finish. Add the file again.", color: 'danger' };
    case 'uploaded':
    case 'processing':
      return { text: `Getting it ready${doc.progress ? ` · ${doc.progress}%` : ''}` };
    case 'failed':
      return { text: doc.failure_message ?? "Couldn't read this file", color: 'danger' };
    case 'ready': {
      const summary = [plural(doc.topic_count, 'topic'), doc.page_count ? plural(doc.page_count, 'page') : null];
      // FR-DOC-07: OCR'd pages that were hard to read are flagged, not hidden.
      if (doc.low_ocr_page_count > 0) {
        const hard = `${plural(doc.low_ocr_page_count, 'page')} hard to read`;
        return { text: [...summary, hard].filter(Boolean).join(' · '), color: 'warning' };
      }
      return { text: summary.filter(Boolean).join(' · ') };
    }
  }
}

// Screen 05 (DESIGN.md §7): a course's documents with live status (FR-CRS-03, FR-DOC-04..09).
export default function CourseScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scope: DocScope = id === 'unfiled' ? 'unfiled' : { courseId: id };
  const courses = useCourses();
  const docs = useDocuments(scope);
  const uploads = useUploads((s) => s.byDoc);
  const course = courses.data?.find((c) => c.id === id);
  const title = id === 'unfiled' ? 'Unfiled' : (course?.title || course?.code || '');
  const busy = docs.data?.find((d) => uploads[d.id] && !uploads[d.id].failed) ??
    docs.data?.find((d) => d.status === 'uploaded' || d.status === 'processing');
  const busyUpload = busy ? uploads[busy.id] : undefined;

  return (
    <Screen
      footer={
        <ActionPill
          label="Add notes"
          icon={Plus}
          variant="light"
          onPress={() => router.push({ pathname: '/upload', params: id === 'unfiled' ? {} : { courseId: id } })}
        />
      }>
      <View style={styles.topBar}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        {course ? (
          <IconButton
            icon={Ellipsis}
            accessibilityLabel="Course options"
            onPress={() => router.push({ pathname: '/course/[id]/edit', params: { id: course.id } })}
          />
        ) : null}
      </View>

      <View style={styles.heading}>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" color="textSecondary">
          {[id === 'unfiled' ? 'Not in a course' : course?.code, docs.data ? plural(docs.data.length, 'document') : null, course?.exam_date ? `Exam ${formatDay(course.exam_date)}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {busy ? (
        <HeroCard style={styles.hero}>
          <View style={styles.heroText}>
            <Text variant="small" color="mutedOnInk" numberOfLines={1}>
              {busy.original_filename}
            </Text>
            <Text variant="title" color="onInk">
              {busyUpload ? 'Uploading your notes.' : 'Getting it ready. You can leave.'}
            </Text>
          </View>
          <ProgressRing
            size={60}
            value={busyUpload ? busyUpload.progress : (busy.progress ?? 0) / 100}
            label={`${Math.round(busyUpload ? busyUpload.progress * 100 : (busy.progress ?? 0))}%`}
          />
        </HeroCard>
      ) : null}

      {docs.isError ? <Banner message={friendlyError(docs.error)} /> : null}

      {docs.isPending ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : docs.data?.length === 0 ? (
        <Text variant="body" color="textSecondary">
          No notes here yet. Add a PDF or PowerPoint to get started.
        </Text>
      ) : (
        <View style={styles.list}>
          {docs.data?.map((d) => {
            const line = statusLine(d, uploads[d.id]);
            return (
              <ListCard
                key={d.id}
                title={d.title}
                meta={line.text}
                metaColor={line.color}
                onPress={() =>
                  d.status === 'ready'
                    ? router.push({ pathname: '/document/[id]', params: { id: d.id } })
                    : router.push({ pathname: '/document/[id]/edit', params: { id: d.id } })
                }
                onLongPress={() => router.push({ pathname: '/document/[id]/edit', params: { id: d.id } })}
                accessibilityHint={
                  d.status === 'ready' ? 'Opens the outline. Long press to rename, move or delete.' : 'Rename, move or delete'
                }
                trailing={line.action ? <Pill label={line.action.label} selected onPress={line.action.onPress} /> : undefined}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  heading: { gap: Spacing.one },
  hero: { flexDirection: 'row', alignItems: 'center' },
  heroText: { flex: 1, gap: Spacing.one },
  list: { gap: Spacing.twoHalf },
  skeleton: { height: 76, borderRadius: Radius.option + 2 },
});
