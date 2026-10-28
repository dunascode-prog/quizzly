import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Check, Plus, X } from '@/components/icons';
import { initials } from '@/components/profile-header';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { IconButton } from '@/components/ui/icon-button';
import { AvatarStack } from '@/components/ui/mate-chip';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Accent, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useJoinLink, usePreview, useRespond } from '@/lib/sharing';

function Tile({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.inkRaised }]}>
      <Text variant="heading" color="onInk">
        {value}
      </Text>
      <Text variant="small" color="mutedOnInk">
        {label}
      </Text>
    </View>
  );
}

/** Screen 20 (DESIGN.md §7, FR-SHARE-03/04): the preview of a shared course before adding it.
 * Opened from an in-app share (`memberId`) or a share link (`code`). */
export function JoinCourse({ memberId, code }: { memberId?: string; code?: string }) {
  const theme = useTheme();
  const preview = usePreview({ memberId, code });
  const respond = useRespond();
  const join = useJoinLink();
  const p = preview.data;
  const first = p?.owner_name?.split(' ')[0] ?? 'They';
  const joined = p?.status === 'active';
  const busy = respond.isPending || join.isPending;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openCourse = (courseId: string) => router.replace({ pathname: '/course/[id]', params: { id: courseId } });

  const add = () => {
    if (!p) return;
    if (joined || p.own_course) return openCourse(p.course_id);
    if (p.member_id && memberId) {
      respond.mutate({ memberId: p.member_id, action: 'accept' }, { onSuccess: (r) => openCourse(r.course_id) });
    } else if (code) {
      join.mutate(code, { onSuccess: (r) => openCourse(r.course_id) });
    }
  };
  const notNow = () => {
    if (p?.member_id && p.status === 'pending') respond.mutate({ memberId: p.member_id, action: 'decline' }, { onSuccess: close });
    else close();
  };

  return (
    <Screen
      footer={
        p ? (
          <>
            <ActionPill
              label={joined || p.own_course ? 'Open course' : 'Add to my library'}
              icon={joined || p.own_course ? Check : Plus}
              onPress={add}
              loading={busy}
            />
            {joined || p.own_course ? null : <TextButton label="Not now" onPress={notNow} disabled={busy} />}
          </>
        ) : null
      }>
      <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
      {preview.isError ? <Banner message={friendlyError(preview.error)} /> : null}
      {respond.isError || join.isError ? <Banner message={friendlyError(respond.error ?? join.error)} /> : null}

      {p ? (
        <>
          <View style={styles.sharer}>
            <View style={[styles.avatar, { backgroundColor: theme.text }]}>
              <Text variant="label" color="onInk">
                {initials(p.owner_name)}
              </Text>
            </View>
            <Text variant="body" style={styles.flex}>
              <Text variant="body" style={styles.bold}>
                {p.owner_name}
              </Text>{' '}
              {p.own_course ? 'is you. This is your course.' : 'shared a course with you'}
            </Text>
          </View>

          <HeroCard>
            <View style={styles.course}>
              <View style={[styles.dot, { backgroundColor: Accent[p.accent] ?? Accent.lagoon }]} />
              <Text variant="small" color="mutedOnInk">
                {[p.code, p.institution, p.level].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text variant="title" color="onInk" accessibilityRole="header">
              {p.title ?? p.code}
            </Text>
            <View style={styles.tiles}>
              <Tile value={p.notes} label={p.notes === 1 ? 'note' : 'notes'} />
              <Tile value={p.topics} label="topics" />
              <Tile value={p.questions} label="questions" />
            </View>
            {p.member_count ? <AvatarStack names={[p.owner_name ?? '', '', '']} count={p.member_count} onInk /> : null}
          </HeroCard>

          <View style={styles.ticks}>
            {['Ready now. No uploading, no waiting.', 'Your scores and progress stay private.', `New notes ${first} adds appear for you too.`].map(
              (line) => (
                <View key={line} style={styles.tick}>
                  <Check size={22} color={theme.text} strokeWidth={2.5} />
                  <Text variant="body" style={styles.flex}>
                    {line}
                  </Text>
                </View>
              ),
            )}
          </View>
        </>
      ) : preview.isPending ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sharer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  course: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: 6 },
  avatar: { width: 44, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  bold: { fontFamily: FontFamily.bold },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: Radius.tile, padding: Spacing.three, gap: 2 },
  ticks: { gap: Spacing.three },
  tick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  skeleton: { height: 260, borderRadius: Radius.card },
});
