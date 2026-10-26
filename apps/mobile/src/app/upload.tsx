import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Camera, FileText, Image as ImageIcon, type LucideIcon, Plus } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, startPhotoUpload, startUpload, useCourses, useUsage } from '@/lib/library';
import { MAX_PHOTOS, PermissionDenied, type Photo, pickPhotos, takePhoto } from '@/lib/photos';

type Mode = 'file' | 'photos' | 'camera';

const TOO_BIG = 'This is too big. Documents can be up to 25 MB and 150 pages.';

function Tile({ label, icon: Icon, selected, onPress }: { label: string; icon: LucideIcon; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Icon size={26} color={selected ? theme.onInk : theme.text} strokeWidth={2} />
      <Text variant="label" color={selected ? 'onInk' : 'text'} style={styles.tileLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function defaultTitle() {
  return `Notes ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

// Screen 04 (DESIGN.md §7): a PDF/PowerPoint, or 1–30 photos as one document (FR-DOC-01/02/03).
export default function UploadSheet() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();
  const usage = useUsage();
  const [mode, setMode] = useState<Mode>('file');
  const [courseId, setCourseId] = useState<string | null>(params.courseId ?? null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = usage.data?.uploads.remaining;
  const photoBytes = photos.reduce((n, p) => n + p.size, 0);

  const done = () => router.dismissTo({ pathname: '/course/[id]', params: { id: courseId ?? 'unfiled' } });

  const fail = (e: unknown) => {
    setError(
      e instanceof PermissionDenied
        ? `Allow Quizzly to use your ${e.message} in your phone's settings, then try again.`
        : friendlyError(e),
    );
  };

  const chooseFile = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, copyToCacheDirectory: true });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!/\.(pdf|pptx)$/i.test(asset.name)) {
      setError('Upload a PDF or PowerPoint (.pptx) file.');
      return;
    }
    const size = asset.size ?? new File(asset.uri).size;
    // Checked here so an over-limit file is never sent (FR-DOC-02); the API checks again.
    if (size > MAX_UPLOAD_BYTES) {
      setError(TOO_BIG);
      return;
    }
    setBusy(true);
    try {
      await startUpload({ uri: asset.uri, name: asset.name, size, mimeType: asset.mimeType }, courseId);
      done();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };

  const addPhotos = async () => {
    setError(null);
    setBusy(true);
    try {
      const added = mode === 'camera' ? [await takePhoto()].filter((p): p is Photo => p !== null) : await pickPhotos(MAX_PHOTOS - photos.length);
      setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const uploadPhotos = async () => {
    setError(null);
    if (photoBytes > MAX_UPLOAD_BYTES) {
      setError(TOO_BIG);
      return;
    }
    setBusy(true);
    try {
      await startPhotoUpload(photos, title.trim() || defaultTitle(), courseId);
      done();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <Sheet title="Add notes" onClose={() => router.back()}>
      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="What to add">
        <Tile label="PDF or slides" icon={FileText} selected={mode === 'file'} onPress={() => switchMode('file')} />
        <Tile label="Camera" icon={Camera} selected={mode === 'camera'} onPress={() => switchMode('camera')} />
        <Tile label="Photos" icon={ImageIcon} selected={mode === 'photos'} onPress={() => switchMode('photos')} />
      </View>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Course">
        <Text variant="label">Course</Text>
        <View style={styles.pills}>
          {courses.data?.map((c) => (
            <Pill key={c.id} label={c.code} role="radio" selected={courseId === c.id} onPress={() => setCourseId(c.id)} />
          ))}
          <Pill label="No course" role="radio" selected={courseId === null} onPress={() => setCourseId(null)} />
          <Pill label="+ New course" accessibilityLabel="New course" onPress={() => router.push('/course/new')} />
        </View>
      </View>

      {mode !== 'file' ? (
        <View style={styles.group}>
          <TextField label="Title" value={title} onChangeText={setTitle} maxLength={80} />
          <View style={styles.pagesHeader}>
            <Text variant="label" style={styles.flex}>
              {photos.length ? plural(photos.length, 'page') : 'No pages yet'}
            </Text>
            {photos.length ? <Pill label="Remove last" onPress={() => setPhotos((p) => p.slice(0, -1))} /> : null}
          </View>
          {photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {photos.map((p, i) => (
                <Image
                  key={p.uri}
                  source={{ uri: p.uri }}
                  style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}
                  contentFit="cover"
                  accessibilityLabel={`Page ${i + 1}`}
                />
              ))}
            </ScrollView>
          ) : null}
          <Pill
            label={mode === 'camera' ? (photos.length ? 'Take another page' : 'Take a photo') : photos.length ? 'Add more photos' : 'Choose photos'}
            onPress={addPhotos}
          />
        </View>
      ) : null}

      {error ? <Banner message={error} /> : null}

      {mode === 'file' ? (
        <ActionPill label="Choose file" icon={Plus} onPress={chooseFile} loading={busy} disabled={remaining === 0} />
      ) : (
        <ActionPill
          label={photos.length ? `Upload ${plural(photos.length, 'page')}` : 'Upload'}
          icon={Plus}
          onPress={uploadPhotos}
          loading={busy}
          disabled={remaining === 0 || photos.length === 0}
        />
      )}
      <Text variant="small" color="textSecondary" style={styles.note}>
        {mode === 'file' ? 'Up to 25 MB or 150 pages' : `Up to ${MAX_PHOTOS} photos, in this order`}
        {remaining !== undefined ? ` · ${plural(remaining, 'upload')} left today` : ''}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: Spacing.twoHalf },
  tile: {
    flex: 1,
    minHeight: 120,
    borderRadius: Radius.option,
    padding: Spacing.twoHalf,
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  tileLabel: { fontSize: 15 },
  group: { gap: Spacing.twoHalf },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pagesHeader: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  thumbs: { gap: Spacing.two },
  thumb: { width: 56, height: 74, borderRadius: 8 },
  note: { textAlign: 'center' },
});
