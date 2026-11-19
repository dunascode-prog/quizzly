import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArrowDownToLine, Check, ChevronRight, Info, type LucideIcon, Merge, Pencil, Split } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { mergeTopic, pageRange, renameTopic, splitTopic, type Topic, useOutline } from '@/lib/study';

const TITLE_MAX = 60;

function OptionRow({ icon: Icon, title, helper, onPress }: { icon: LucideIcon; title: string; helper: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={helper}
      style={({ pressed }) => [styles.option, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.optionIcon, { backgroundColor: theme.text }]}>
        <Icon size={22} color={theme.onInk} />
      </View>
      <View style={styles.flex}>
        <Text variant="label">{title}</Text>
        <Text variant="small" color="textSecondary">
          {helper}
        </Text>
      </View>
      <ChevronRight size={22} color={theme.text} />
    </Pressable>
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

function Circle({ n, ink }: { n: number; ink: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.circle, { backgroundColor: ink ? theme.text : theme.onInk }]}>
      <Text variant="label" color={ink ? 'onInk' : 'text'}>
        {n}
      </Text>
    </View>
  );
}

function PreviewRow({ n, topic }: { n: number; topic: Topic }) {
  const theme = useTheme();
  return (
    <View style={[styles.previewRow, { backgroundColor: theme.inkRaised }]}>
      <Circle n={n} ink={false} />
      <Text variant="label" color="onInk" style={styles.flex} numberOfLines={2}>
        {topic.title}
      </Text>
      <Text variant="small" color="mutedOnInk">
        {pageRange(topic)}
      </Text>
    </View>
  );
}

// Screen 27 (DESIGN.md §7, FR-TOP-03): from a long-press on a topic in the outline, rename it or
// merge it with the next one, for this student only.
export default function TopicMenuSheet() {
  const theme = useTheme();
  const { id, topicId } = useLocalSearchParams<{ id: string; topicId: string }>();
  const outline = useOutline(id);
  const topics = outline.data?.topics ?? [];
  const index = topics.findIndex((t) => t.id === topicId);
  const topic = topics[index];
  const next = index >= 0 ? topics[index + 1] : undefined;
  const [mode, setMode] = useState<'menu' | 'rename' | 'merge'>('menu');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => router.back();
  const run = async (change: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await change();
      close();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  if (!topic) {
    return (
      <Sheet title="Topic" onClose={close}>
        {outline.isError ? <Banner message={friendlyError(outline.error)} /> : null}
      </Sheet>
    );
  }

  const n = index + 1;
  const merged = (topic.parts?.length ?? 1) > 1;

  if (mode === 'rename') {
    const trimmed = name.trim();
    return (
      <Sheet title="Rename topic" highlight="topic" onClose={close}>
        <TextField
          label="Topic name"
          value={name}
          onChangeText={setName}
          onClear={() => setName('')}
          maxLength={TITLE_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => trimmed && void run(() => renameTopic(id, topic.id, trimmed))}
        />
        <View style={styles.counter}>
          <Text variant="small" color="textSecondary" style={styles.flex} numberOfLines={1}>
            Was: {topic.original_title ?? topic.title}
          </Text>
          <Text variant="small" color="textSecondary">
            {name.length}/{TITLE_MAX}
          </Text>
        </View>
        <Note>Only you see the new name. Explanations, questions and your scores stay linked to this topic.</Note>
        {error ? <Banner message={error} /> : null}
        <ActionPill
          label="Save name"
          icon={Check}
          onPress={() => void run(() => renameTopic(id, topic.id, trimmed))}
          loading={busy}
          disabled={!trimmed || trimmed === topic.title}
        />
        {topic.original_title && !merged ? (
          <TextButton label="Reset to original name" onPress={() => !busy && void run(() => renameTopic(id, topic.id, null))} />
        ) : null}
      </Sheet>
    );
  }

  if (mode === 'merge' && next) {
    const fallback = `${topic.title} and ${next.title}`;
    const combined = name.trim() || fallback;
    const start = topic.page_start ?? next.page_start;
    const end = next.page_end ?? topic.page_end;
    const pages = start && end ? end - start + 1 : null;
    return (
      <Sheet title="Merge topics" highlight="topics" onClose={close}>
        <HeroCard>
          <PreviewRow n={n} topic={topic} />
          <PreviewRow n={n + 1} topic={next} />
          <View style={styles.arrow} importantForAccessibility="no-hide-descendants">
            <ArrowDownToLine size={24} color={theme.mutedOnInk} />
          </View>
          <Text variant="caption" color="mutedOnInk" style={styles.caps}>
            BECOMES ONE TOPIC
          </Text>
          <Text variant="heading" color="onInk">
            {combined}
          </Text>
          <Text variant="small" color="mutedOnInk">
            {[`Topic ${n}`, pageRange({ page_start: start, page_end: end }), pages ? plural(pages, 'page') : null].filter(Boolean).join(' · ')}
          </Text>
        </HeroCard>
        <TextField
          label="Name for the merged topic"
          value={name}
          onChangeText={setName}
          placeholder={fallback.slice(0, TITLE_MAX)}
          maxLength={TITLE_MAX}
        />
        <Note>{`Only you see this. Your outline goes from ${topics.length} to ${topics.length - 1} topics; nothing is deleted, and you can split them again.`}</Note>
        {error ? <Banner message={error} /> : null}
        <ActionPill label="Merge topics" icon={Merge} onPress={() => void run(() => mergeTopic(id, topic.id, name.trim() || null))} loading={busy} />
        <TextButton label="Cancel" onPress={close} />
      </Sheet>
    );
  }

  return (
    <Sheet title={topic.title} subtitle={[`Topic ${n}`, pageRange(topic)].filter(Boolean).join(' · ')} leading={<Circle n={n} ink />} onClose={close}>
      <OptionRow
        icon={Pencil}
        title="Rename"
        helper="Give it a name that makes sense to you"
        onPress={() => {
          setName(topic.title);
          setMode('rename');
        }}
      />
      {merged ? (
        <OptionRow
          icon={Split}
          title={`Split back into ${topic.parts?.length} topics`}
          helper="Back to the original topics and names"
          onPress={() => !busy && void run(() => splitTopic(id, topic.id))}
        />
      ) : null}
      {next ? (
        <OptionRow
          icon={Merge}
          title="Merge with next topic"
          helper={`Combine with ${n + 1} · ${next.title}`}
          onPress={() => {
            setName('');
            setMode('merge');
          }}
        />
      ) : null}
      <Note>Only you see these changes. Coursemates and shared copies keep the original names.</Note>
      {error ? <Banner message={error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: {
    minHeight: 72,
    borderRadius: Radius.option + 2,
    padding: Spacing.twoHalf,
    paddingRight: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  optionIcon: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  circle: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  counter: { flexDirection: 'row', gap: Spacing.two, marginTop: -Spacing.two },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.twoHalf, paddingRight: Spacing.three, borderRadius: Radius.option },
  arrow: { alignItems: 'center' },
  caps: { letterSpacing: 1.2 },
});
