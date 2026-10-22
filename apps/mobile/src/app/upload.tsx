import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Camera, FileText, Image, type LucideIcon, Plus } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, startUpload, useCourses, useUsage } from '@/lib/library';

function Tile({ label, icon: Icon, selected, note }: { label: string; icon: LucideIcon; selected?: boolean; note?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !selected }}
      accessibilityLabel={note ? `${label}, ${note}` : label}
      style={[styles.tile, { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: selected ? 1 : 0.6 }]}>
      <Icon size={26} color={selected ? theme.onInk : theme.text} strokeWidth={2} />
      <Text variant="label" color={selected ? 'onInk' : 'text'} style={styles.tileLabel}>
        {label}
      </Text>
      {note ? (
        <Text variant="caption" color={selected ? 'mutedOnInk' : 'textSecondary'}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

// Screen 04 (DESIGN.md §7): pick a PDF or PowerPoint and a course (FR-DOC-01/02/03).
export default function UploadSheet() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();
  const usage = useUsage();
  const [courseId, setCourseId] = useState<string | null>(params.courseId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = usage.data?.uploads.remaining;

  const choose = async () => {
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
      setError('This file is too big. Documents can be up to 25 MB and 150 pages.');
      return;
    }
    setBusy(true);
    try {
      await startUpload({ uri: asset.uri, name: asset.name, size, mimeType: asset.mimeType }, courseId);
      router.dismissTo({ pathname: '/course/[id]', params: { id: courseId ?? 'unfiled' } });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add notes" onClose={() => router.back()}>
      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="What to add">
        <Tile label="PDF or slides" icon={FileText} selected />
        <Tile label="Camera" icon={Camera} note="Coming soon" />
        <Tile label="Photos" icon={Image} note="Coming soon" />
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

      {error ? <Banner message={error} /> : null}

      <ActionPill label="Choose file" icon={Plus} onPress={choose} loading={busy} disabled={remaining === 0} />
      <Text variant="small" color="textSecondary" style={styles.note}>
        Up to 25 MB or 150 pages{remaining !== undefined ? ` · ${plural(remaining, 'upload')} left today` : ''}
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
  note: { textAlign: 'center' },
});
