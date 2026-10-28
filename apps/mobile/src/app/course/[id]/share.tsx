import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Check, Search, Share2 } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { MateChip } from '@/components/ui/mate-chip';
import { Pill } from '@/components/ui/pill';
import { PrivacyList } from '@/components/ui/privacy-list';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { useCourses, useDocuments } from '@/lib/library';
import { useCoursemates, useShare, useShareCourse, useStopSharing } from '@/lib/sharing';

// Screen 19 (DESIGN.md §7, FR-SHARE-01/02/07): what coursemates get and what stays private, send
// in Quizzly (coursemates or a Quizzly code), the share link, and Stop sharing.
export default function ShareCourseSheet() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = useCourses().data?.find((c) => c.id === id);
  const docs = useDocuments({ courseId: id });
  const share = useShare(id);
  const mates = useCoursemates();
  const send = useShareCourse(id);
  const stop = useStopSharing(id);
  const [picked, setPicked] = useState<string[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  // Opening the sheet makes the link (one active link per course).
  const { mutate: createLink } = send;
  useEffect(() => {
    if (share.isSuccess && share.data === null) createLink({});
  }, [share.isSuccess, share.data, createLink]);

  const topics = (docs.data ?? []).filter((d) => d.status === 'ready').reduce((n, d) => n + d.topic_count, 0);
  const link = share.data?.link ?? send.data?.link;
  const recipients = picked.length + codes.length;
  const label = course?.code ?? 'this course';

  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addCode = () => {
    const c = code.trim().toUpperCase();
    if (c.length >= 3 && !codes.includes(c)) setCodes([...codes, c]);
    setCode('');
    setTyping(false);
  };

  const primary = () => {
    if (recipients) {
      send.mutate(
        { user_ids: picked, codes },
        {
          onSuccess: () => {
            setSent(recipients);
            setPicked([]);
            setCodes([]);
          },
        },
      );
    } else if (link) {
      const text = `Study ${label} with me on Quizzly. The notes are ready, no uploading: ${link}`;
      void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
    }
  };

  return (
    <Sheet title={`Share ${label}`} highlight={course?.code} onClose={() => router.back()}>
      <Text variant="body" color="textSecondary">
        Coursemates study it without uploading
      </Text>
      <PrivacyList
        get={[
          topics ? `Outlines and explanations · ${plural(topics, 'topic')}` : 'Outlines and explanations',
          'Practice questions from every note',
          'Notes you add later, automatically',
        ]}
        private={['Your scores, chats and progress', 'Original files (they see quoted pages only)']}
      />

      <Text variant="caption" color="textSecondary" style={styles.caption}>
        SEND IN QUIZZLY · THEY&apos;RE NOTIFIED INSTANTLY
      </Text>
      <View style={styles.chips}>
        <IconButton icon={Search} accessibilityLabel="Add someone by their Quizzly code" onPress={() => setTyping(!typing)} />
        {(mates.data ?? []).map((m) => (
          <MateChip
            key={m.user_id}
            name={m.display_name ?? 'Coursemate'}
            selected={picked.includes(m.user_id)}
            onPress={() => setPicked(picked.includes(m.user_id) ? picked.filter((x) => x !== m.user_id) : [...picked, m.user_id])}
          />
        ))}
        {codes.map((c) => (
          <MateChip key={c} name={c} selected onPress={() => setCodes(codes.filter((x) => x !== c))} />
        ))}
      </View>
      {typing ? (
        <TextField
          label="Their Quizzly code, e.g. TOLU7"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={addCode}
          onBlur={addCode}
        />
      ) : null}
      {sent ? (
        <Text variant="label" color="success" accessibilityLiveRegion="polite">
          Sent to {plural(sent, 'person')}. They&apos;re notified now.
        </Text>
      ) : null}

      <View style={[styles.link, { backgroundColor: theme.backgroundSelected }]}>
        <View style={styles.flex}>
          <Text variant="caption" color="textSecondary">
            Invite link
          </Text>
          <Text variant="label" selectable numberOfLines={1}>
            {link ? link.replace(/^https?:\/\//, '') : 'Making your link…'}
          </Text>
        </View>
        <Pressable
          onPress={() => void copy()}
          disabled={!link}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy link'}
          style={[styles.copy, { backgroundColor: theme.backgroundElement }]}>
          {copied ? <Check size={18} color={theme.success} /> : null}
          <Text variant="label">{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>

      {send.isError || stop.isError ? <Banner message={friendlyError(send.error ?? stop.error)} /> : null}
      <ActionPill
        label={recipients ? `Send to ${recipients}` : 'Share to WhatsApp'}
        icon={Share2}
        onPress={primary}
        loading={send.isPending && recipients > 0}
        disabled={!link && !recipients}
      />

      <View style={styles.footer}>
        <TextButton
          label={`${plural(share.data?.member_count ?? 0, 'coursemate')} joined`}
          color="textSecondary"
          onPress={() => router.push({ pathname: '/course/[id]/members', params: { id } })}
        />
        {confirmStop ? (
          <Pill
            label={stop.isPending ? 'Stopping…' : 'Yes, stop sharing'}
            onPress={() => stop.mutate(undefined, { onSuccess: () => router.back() })}
          />
        ) : (
          <TextButton label="Stop sharing" color="danger" onPress={() => setConfirmStop(true)} />
        )}
      </View>
      {confirmStop ? (
        <Text variant="small" color="textSecondary">
          Everyone loses access. Their past scores stay in their history.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  caption: { letterSpacing: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Radius.field, paddingLeft: Spacing.gutter, padding: Spacing.two },
  flex: { flex: 1 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: 48 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
});
