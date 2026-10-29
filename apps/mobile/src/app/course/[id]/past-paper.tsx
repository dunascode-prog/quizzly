import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Camera, FileText, type LucideIcon, Upload } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { MAX_UPLOAD_BYTES, startPhotoUpload, startUpload, useCourses, useUsage } from '@/lib/library';
import { MAX_PHOTOS, PermissionDenied, pickPhotos } from '@/lib/photos';

const TOO_BIG = 'This is too big. Documents can be up to 25 MB and 150 pages.';

function years() {
  const now = new Date().getFullYear();
  return [String(now - 1), String(now - 2), String(now - 3)];
}

function Step({ n, children }: { n: number; children: string }) {
  const theme = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: theme.onInk }]}>
        <Text variant="label">{n}</Text>
      </View>
      <Text variant="body" color="onInk" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

function Tile({ label, icon: Icon, selected, onPress }: { label: string; icon: LucideIcon; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.tileIcon, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement }]}>
        <Icon size={22} color={theme.text} />
      </View>
      <Text variant="label" color={selected ? 'onInk' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

// Screen 26a (DESIGN.md §7, FR-QGEN-09): upload a past paper so quizzes can copy its style. It's
// processed like notes but only its format is kept, and it's never shared with coursemates.
export default function PastPaperSheet() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = useCourses().data?.find((c) => c.id === id);
  const remaining = useUsage().data?.uploads.remaining;
  const [year, setYear] = useState(years()[0]);
  const [mode, setMode] = useState<'pdf' | 'photos'>('pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paper = { year };
  const title = `${course?.code ?? 'Past'} past paper${year === 'older' ? '' : ` ${year}`}`;

  const run = async (upload: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await upload();
      router.back();
    } catch (e) {
      setError(e instanceof PermissionDenied ? `Allow Quizzly to use your ${e.message} in your phone's settings, then try again.` : friendlyError(e));
      setBusy(false);
    }
  };

  const choosePdf = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const size = asset.size ?? new File(asset.uri).size;
    if (size > MAX_UPLOAD_BYTES) {
      setError(TOO_BIG);
      return;
    }
    await run(() => startUpload({ uri: asset.uri, name: asset.name, size, mimeType: asset.mimeType }, id, paper));
  };

  const choosePhotos = async () => {
    setError(null);
    try {
      const photos = await pickPhotos(MAX_PHOTOS);
      if (!photos.length) return;
      if (photos.reduce((n, p) => n + p.size, 0) > MAX_UPLOAD_BYTES) {
        setError(TOO_BIG);
        return;
      }
      await run(() => startPhotoUpload(photos, title, id, paper));
    } catch (e) {
      setError(e instanceof PermissionDenied ? `Allow Quizzly to use your ${e.message} in your phone's settings, then try again.` : friendlyError(e));
    }
  };

  return (
    <Sheet title="Add past questions" highlight="questions" onClose={() => router.back()}>
      <HeroCard>
        <Text variant="caption" color="mutedOnInk" style={styles.caps}>
          HOW IT WORKS
        </Text>
        <Step n={1}>Upload a past paper for this course.</Step>
        <Step n={2}>Quizzly learns its style: question types, wording and marks.</Step>
        <Step n={3}>New questions copy that style, using only your notes.</Step>
        <Text variant="small" color="mutedOnInk">
          We never reuse the old questions or answers word for word.
        </Text>
      </HeroCard>

      <View style={[styles.field, { backgroundColor: theme.backgroundSelected }]} accessible accessibilityLabel={`Course: ${course?.code ?? ''}`}>
        <Text variant="caption" color="textSecondary">
          Course
        </Text>
        <Text variant="label">{[course?.code, course?.title].filter(Boolean).join(' · ')}</Text>
      </View>

      <View style={styles.years} accessibilityRole="radiogroup" accessibilityLabel="Year">
        <Text variant="label">Year</Text>
        {[...years(), 'older'].map((y) => (
          <Pill key={y} label={y === 'older' ? 'Older' : y} role="radio" selected={year === y} onPress={() => setYear(y)} />
        ))}
      </View>

      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="What to add">
        <Tile label="Photos" icon={Camera} selected={mode === 'photos'} onPress={() => setMode('photos')} />
        <Tile label="PDF" icon={FileText} selected={mode === 'pdf'} onPress={() => setMode('pdf')} />
      </View>

      {error ? <Banner message={error} /> : null}
      <ActionPill
        label={mode === 'pdf' ? 'Choose PDF' : 'Choose photos'}
        icon={Upload}
        onPress={() => void (mode === 'pdf' ? choosePdf() : choosePhotos())}
        loading={busy}
        disabled={remaining === 0}
      />
      <Text variant="small" color="textSecondary" style={styles.center}>
        Up to 25 MB · counts as 1 upload today
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  caps: { letterSpacing: 1.2 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  stepNumber: { width: 28, height: 28, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  field: { borderRadius: Radius.field, paddingHorizontal: Spacing.gutter - 2, paddingVertical: Spacing.twoHalf, gap: Spacing.half, minHeight: Size.field, justifyContent: 'center' },
  years: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  tiles: { flexDirection: 'row', gap: Spacing.twoHalf },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.full, minHeight: Size.field },
  tileIcon: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
