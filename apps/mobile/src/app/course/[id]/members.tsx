import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft, Flag, UserX } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { NeedsInternet } from '@/components/ui/needs-internet';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useCourses } from '@/lib/library';
import { useMembers, useRegenerateLink, useRemoveMember, useStopSharing } from '@/lib/sharing';
import { useOnline } from '@/lib/network';

// Members of a shared course (DESIGN.md §7, FR-SHARE-07): display names, and photos of those who
// show them (FR-PROF-05, which can be reported: FR-MOD-06); remove a member, regenerate the link
// (the old one stops working), stop sharing.
export default function MembersScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = useCourses().data?.find((c) => c.id === id);
  const members = useMembers(id);
  const online = useOnline();
  const remove = useRemoveMember(id);
  const regenerate = useRegenerateLink(id);
  const stop = useStopSharing(id);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const error = members.error ?? remove.error ?? regenerate.error ?? stop.error;
  const active = (members.data ?? []).filter((m) => m.status === 'active');
  const pending = (members.data ?? []).filter((m) => m.status === 'pending');

  return (
    <Screen>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="coursemates">{`${course?.code ?? 'Course'} coursemates`}</HighlightText>
      {error ? <Banner message={friendlyError(error)} /> : null}
      {!online && !members.data ? <NeedsInternet what="Who's in this course" /> : null}

      {members.isPending ? (
        online ? <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} /> : null
      ) : active.length + pending.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nobody has joined yet. Share the link from the course&apos;s share button.
        </Text>
      ) : (
        <View style={styles.list}>
          {[...active, ...pending].map((m) => (
            <View key={m.member_id} style={[styles.row, { backgroundColor: theme.backgroundSelected }]}>
              <Avatar name={m.display_name} uri={m.avatar_url} size={40} tone="ink" remote />
              <View style={styles.flex}>
                <Text variant="label">{m.display_name ?? 'Coursemate'}</Text>
                <Text variant="small" color="textSecondary">
                  {m.status === 'pending' ? 'Invited, not added yet' : 'Studying it'}
                </Text>
              </View>
              {m.avatar_url && removing !== m.member_id ? (
                <IconButton
                  icon={Flag}
                  accessibilityLabel={`Report ${m.display_name ?? 'coursemate'}'s photo`}
                  onPress={() => router.push({ pathname: '/report', params: { targetType: 'avatar', targetId: m.user_id } })}
                />
              ) : null}
              {removing === m.member_id ? (
                <Pill label="Remove" onPress={() => remove.mutate(m.member_id, { onSettled: () => setRemoving(null) })} />
              ) : (
                <IconButton icon={UserX} accessibilityLabel={`Remove ${m.display_name ?? 'coursemate'}`} onPress={() => setRemoving(m.member_id)} />
              )}
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TextButton
          label={regenerate.isSuccess ? 'New link made. The old one no longer works.' : 'Regenerate link'}
          onPress={() => regenerate.mutate()}
          disabled={regenerate.isPending}
        />
        {confirmStop ? (
          <>
            <Text variant="small" color="textSecondary" style={styles.center}>
              Everyone loses access. Their past scores stay in their history.
            </Text>
            <Pill label="Yes, stop sharing" onPress={() => stop.mutate(undefined, { onSuccess: () => router.back() })} />
          </>
        ) : (
          <TextButton label="Stop sharing" color="danger" onPress={() => setConfirmStop(true)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option },
  flex: { flex: 1 },
  actions: { gap: Spacing.two, alignItems: 'center', marginTop: Spacing.three },
  center: { textAlign: 'center' },
  skeleton: { height: 160, borderRadius: Radius.card },
});
