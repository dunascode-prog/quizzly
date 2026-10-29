import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArrowDownToLine, BookOpen, Check, Info } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { useCourses } from '@/lib/library';
import { cancelDownload, download, type Job, size, useManifest, useOffline } from '@/lib/offline';

const STYLE_NAMES: Record<string, string> = { standard: 'Standard', simple: 'Simple', exam: 'Exam' };

function Tick() {
  const theme = useTheme();
  return (
    <View style={[styles.tick, { backgroundColor: theme.onInk }]}>
      <Check size={18} color={theme.text} strokeWidth={2.5} />
    </View>
  );
}

function SaveRow({ title, helper }: { title: string; helper: string }) {
  return (
    <View style={styles.saveRow} accessible accessibilityLabel={`${title}. ${helper}`}>
      <Tick />
      <View style={styles.flex}>
        <Text variant="label" color="onInk">
          {title}
        </Text>
        <Text variant="small" color="mutedOnInk">
          {helper}
        </Text>
      </View>
    </View>
  );
}

function PartRow({ label, part }: { label: string; part: Job['outlines'] }) {
  const finished = part.done >= part.total;
  return (
    <View style={styles.partRow} accessible accessibilityLabel={`${label}: ${finished ? 'done' : `${part.done} of ${part.total}`}`}>
      {finished ? <Tick /> : <ProgressRing size={28} strokeWidth={3} />}
      <Text variant="label" color="onInk" style={styles.flex}>
        {label}
      </Text>
      <Text variant="small" color="mutedOnInk">
        {finished && part.total > 1 && label !== 'Outlines' ? 'Done' : `${part.done} of ${part.total}`}
      </Text>
    </View>
  );
}

function Note({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <View style={styles.note}>
      <Info size={20} color={theme.textSecondary} />
      <Text variant="small" color="textSecondary" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

// Screen 28 (DESIGN.md §7, FR-OFF-03): what saving the course takes, the size first, then progress
// per part. The download carries on if the sheet is closed.
export default function OfflineSheet() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = useCourses().data?.find((c) => c.id === id);
  const manifest = useManifest(id);
  const job = useOffline((s) => s.jobs[id]);
  const saved = useOffline((s) => s.saved[id]);
  const [wifiOnly, setWifiOnly] = useState(saved?.wifiOnly ?? false);
  const [started, setStarted] = useState(false);
  const close = () => router.back();
  const m = manifest.data;

  // Finished while the sheet is open: close it, so the course shows "Saved for offline" (28c).
  useEffect(() => {
    if (started && !job) router.back();
  }, [started, job]);

  if (job) {
    const pct = job.bytesTotal ? Math.min(1, job.bytesDone / job.bytesTotal) : 0;
    return (
      <Sheet title="Saving for offline" highlight="offline" onClose={close}>
        <HeroCard>
          <View style={styles.progressTop}>
            <ProgressRing size={88} strokeWidth={6} value={pct} label={`${Math.round(pct * 100)}%`} />
            <View style={styles.flex}>
              <Text variant="title" color="onInk">
                {size(job.bytesDone)} of {size(job.bytesTotal)}
              </Text>
              <Text variant="small" color="mutedOnInk">
                {job.status === 'waiting_wifi' ? 'Waiting for Wi‑Fi. It carries on when you connect.' : "You can leave this screen. We'll keep going."}
              </Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.track }]} />
          <PartRow label="Outlines" part={job.outlines} />
          <PartRow label={plural(job.explanations.total, 'explanation')} part={job.explanations} />
          <PartRow label="Quizzes" part={job.quizzes} />
        </HeroCard>
        <ActionPill label="Keep studying" icon={BookOpen} onPress={close} />
        <TextButton
          label="Cancel download"
          onPress={() => {
            cancelDownload(id);
            close();
          }}
        />
      </Sheet>
    );
  }

  const opened = m ? [...new Set(m.explanations.map((e) => e.style))] : [];
  const questions = m ? m.quizzes.reduce((n, q) => n + q.questions, 0) : 0;
  const empty = m && m.explanations.length + m.quizzes.length === 0 && m.documents.length === 0;

  return (
    <Sheet title="Save for offline" highlight="offline" onClose={close}>
      {manifest.isError ? <Banner message={friendlyError(manifest.error)} /> : null}
      {m ? (
        <HeroCard>
          <Text variant="caption" color="mutedOnInk" style={styles.caps}>
            {"WHAT WE'LL SAVE"}
          </Text>
          <SaveRow
            title={plural(m.explanations.length, 'explanation')}
            helper={
              opened.length === 3
                ? "All 3 styles you've opened"
                : opened.length
                  ? `${opened.map((s) => STYLE_NAMES[s] ?? s).join(' and ')} style`
                  : 'Open a topic first to save its explanation'
            }
          />
          <SaveRow title={`${m.quizzes.length} ${m.quizzes.length === 1 ? 'quiz' : 'quizzes'}`} helper={`${plural(questions, 'question')} with answers`} />
          <SaveRow title="Outlines" helper={m.documents.length === 1 ? 'For your 1 document' : `For all ${m.documents.length} documents`} />
          <View style={[styles.divider, { backgroundColor: theme.track }]} />
          <View style={styles.total}>
            <Text variant="body" color="mutedOnInk">
              About
            </Text>
            <Text variant="number" color="onInk" style={styles.totalNumber}>
              {size(m.bytes)}
            </Text>
          </View>
          <Text variant="small" color="mutedOnInk">
            Original files stay online. Chat needs internet.
          </Text>
        </HeroCard>
      ) : (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      )}
      <ToggleRow label="Only download on Wi‑Fi" value={wifiOnly} onChange={setWifiOnly} />
      <Note>{`New notes you add to ${course?.code ?? 'this course'} are saved automatically while this is on.`}</Note>
      <ActionPill
        label={saved ? 'Update' : 'Download'}
        icon={ArrowDownToLine}
        disabled={!m || Boolean(empty)}
        onPress={() => {
          if (!m) return;
          setStarted(true);
          void download(id, m, { wifiOnly });
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  caps: { letterSpacing: 1.2 },
  tick: { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 36 },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  divider: { height: StyleSheet.hairlineWidth * 2 },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  totalNumber: { fontSize: 48, lineHeight: 52 },
  note: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  skeleton: { height: 280, borderRadius: Radius.card, minHeight: Size.field },
});
