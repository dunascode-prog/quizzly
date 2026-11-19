import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ArrowDownToLine, Check, ChevronLeft, Ellipsis, Plus, Share2 } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { IconButton } from '@/components/ui/icon-button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { formatDay, plural } from '@/lib/format';
import { type Doc, type DocScope, retryUpload, useCourses, useDocuments, useUploads } from '@/lib/library';
import { download, type Manifest, size, updatedAgo, useAutoUpdate, useOffline } from '@/lib/offline';
import { queryClient } from '@/lib/query-client';
import { useReportCourse, useRespond } from '@/lib/sharing';

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
      // A past paper is only used for its style (FR-QGEN-09).
      if (doc.kind === 'past_paper') {
        return { text: ['Past paper', doc.paper_year && doc.paper_year !== 'older' ? doc.paper_year : null, 'used for quiz style'].filter(Boolean).join(' · ') };
      }
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

const REASONS: { key: 'copyright' | 'wrong' | 'spam' | 'other'; label: string }[] = [
  { key: 'copyright', label: 'Copyright' },
  { key: 'wrong', label: 'Wrong content' },
  { key: 'spam', label: 'Spam' },
  { key: 'other', label: 'Something else' },
];

/** The "…" menu of a course shared with you: Leave course, Report course (DESIGN.md §7, 05). */
function JoinedMenu({ courseId, memberId, onClose }: { courseId: string; memberId: string; onClose: () => void }) {
  const theme = useTheme();
  const respond = useRespond();
  const report = useReportCourse(courseId);
  const [reporting, setReporting] = useState(false);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={onClose} accessible={false} />
      <View style={[styles.menu, { backgroundColor: theme.background }]}>
        {report.isSuccess ? (
          <Text variant="body" style={styles.center} accessibilityLiveRegion="polite">
            Thanks. We&apos;ll look at it.
          </Text>
        ) : reporting ? (
          <>
            <Text variant="label" style={styles.center}>
              What&apos;s wrong with this course?
            </Text>
            <View style={styles.reasons}>
              {REASONS.map((r) => (
                <Pill key={r.key} label={r.label} onPress={() => report.mutate(r.key)} />
              ))}
            </View>
          </>
        ) : (
          <>
            <TextButton
              label={respond.isPending ? 'Leaving…' : 'Leave course'}
              color="danger"
              onPress={() =>
                respond.mutate({ memberId, action: 'leave' }, { onSuccess: () => router.dismissTo('/library') })
              }
            />
            <TextButton label="Report course" onPress={() => setReporting(true)} />
          </>
        )}
        {respond.isError || report.isError ? <Banner message={friendlyError(respond.error ?? report.error)} /> : null}
        <TextButton label={report.isSuccess ? 'Done' : 'Cancel'} color="textSecondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

// Screen 05 (DESIGN.md §7): a course's documents with live status (FR-CRS-03, FR-DOC-04..09). A course
// shared with you is read-only: no upload, rename or delete; you can leave or report it (FR-DOC-12).
export default function CourseScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scope: DocScope = id === 'unfiled' ? 'unfiled' : { courseId: id };
  const courses = useCourses();
  const docs = useDocuments(scope);
  const uploads = useUploads((s) => s.byDoc);
  const course = courses.data?.find((c) => c.id === id);
  const joined = Boolean(course?.shared_by);
  const [menu, setMenu] = useState(false);
  const title = id === 'unfiled' ? 'Unfiled' : (course?.title || course?.code || '');
  const busy = docs.data?.find((d) => uploads[d.id] && !uploads[d.id].failed) ??
    docs.data?.find((d) => d.status === 'uploaded' || d.status === 'processing');
  const busyUpload = busy ? uploads[busy.id] : undefined;
  // Save for offline (screen 28, FR-OFF-03); new notes are fetched too while it's on.
  const offlineJob = useOffline((s) => s.jobs[id]);
  const saved = useOffline((s) => s.saved[id]);
  useAutoUpdate(id === 'unfiled' ? '' : id);
  const update = () =>
    void queryClient
      .fetchQuery({ queryKey: ['offline-manifest', id], queryFn: () => apiFetch<Manifest>(`/v1/courses/${id}/offline`), staleTime: 0 })
      .then((m) => download(id, m, { wifiOnly: saved?.wifiOnly }))
      .catch(() => {});

  return (
    <Screen
      footer={
        joined ? undefined : (
          <ActionPill
            label="Add notes"
            icon={Plus}
            variant="light"
            onPress={() => router.push({ pathname: '/upload', params: id === 'unfiled' ? {} : { courseId: id } })}
          />
        )
      }>
      <View style={styles.topBar}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        {course ? (
          <View style={styles.actions}>
            <IconButton
              icon={ArrowDownToLine}
              tone={saved || offlineJob ? 'ink' : 'light'}
              accessibilityLabel={saved ? 'Saved for offline' : 'Save for offline'}
              onPress={() => router.push({ pathname: '/course/[id]/offline', params: { id: course.id } })}
            />
            {joined ? null : (
              <IconButton
                icon={Share2}
                accessibilityLabel={course.shared ? 'Sharing options' : 'Share with coursemates'}
                onPress={() => router.push({ pathname: '/course/[id]/share', params: { id: course.id } })}
              />
            )}
            <IconButton
              icon={Ellipsis}
              accessibilityLabel="Course options"
              onPress={() =>
                joined ? setMenu(true) : router.push({ pathname: '/course/[id]/edit', params: { id: course.id } })
              }
            />
          </View>
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
        {course?.shared_by ? (
          <View style={[styles.tag, { backgroundColor: theme.backgroundSelected }]}>
            <Text variant="caption" color="textSecondary">
              Shared by {course.shared_by} · read-only
            </Text>
          </View>
        ) : null}
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
      ) : offlineJob ? (
        <HeroCard style={styles.hero}>
          <View style={styles.heroText}>
            <Text variant="title" color="onInk">
              Saving for offline
            </Text>
            <Text variant="small" color="mutedOnInk">
              {offlineJob.status === 'waiting_wifi' ? 'Waiting for Wi‑Fi.' : 'You can keep studying.'}
            </Text>
          </View>
          <ProgressRing
            size={60}
            value={offlineJob.bytesTotal ? offlineJob.bytesDone / offlineJob.bytesTotal : 0}
            label={`${Math.round(offlineJob.bytesTotal ? (offlineJob.bytesDone / offlineJob.bytesTotal) * 100 : 0)}%`}
          />
        </HeroCard>
      ) : saved ? (
        <HeroCard style={styles.hero}>
          <View style={[styles.savedCheck, { borderColor: theme.onInk }]}>
            <Check size={30} color={theme.onInk} strokeWidth={2.5} />
          </View>
          <View style={styles.heroText}>
            <Text variant="heading" color="onInk">
              Saved for offline
            </Text>
            <Text variant="small" color="mutedOnInk">
              {size(saved.bytes)} · Updated {updatedAgo(saved.savedAt)}
            </Text>
          </View>
          <Pill label="Update" onPress={update} accessibilityLabel="Update the offline copy" />
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
                meta={saved?.documentIds.includes(d.id) && d.status === 'ready' ? `${line.text} · ✓ On this phone` : line.text}
                metaColor={line.color}
                onPress={() =>
                  d.status === 'ready' && d.kind !== 'past_paper'
                    ? router.push({ pathname: '/document/[id]', params: { id: d.id } })
                    : router.push({ pathname: '/document/[id]/edit', params: { id: d.id } })
                }
                onLongPress={d.read_only ? undefined : () => router.push({ pathname: '/document/[id]/edit', params: { id: d.id } })}
                accessibilityHint={
                  d.read_only
                    ? 'Opens the outline'
                    : d.status === 'ready'
                      ? 'Opens the outline. Long press to rename, move or delete.'
                      : 'Rename, move or delete'
                }
                trailing={line.action ? <Pill label={line.action.label} selected onPress={line.action.onPress} /> : undefined}
              />
            );
          })}
        </View>
      )}
      {menu && course?.member_id ? <JoinedMenu courseId={course.id} memberId={course.member_id} onClose={() => setMenu(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  tag: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: 4, marginTop: Spacing.one },
  menu: { position: 'absolute', left: Spacing.gutter, right: Spacing.gutter, bottom: Spacing.six, borderRadius: Radius.sheet, padding: Spacing.three, gap: Spacing.two },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  center: { textAlign: 'center' },
  heading: { gap: Spacing.one },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  savedCheck: { width: 60, height: 60, borderRadius: Radius.full, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: Spacing.one },
  list: { gap: Spacing.twoHalf },
  skeleton: { height: 76, borderRadius: Radius.option + 2 },
});
