import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronLeft } from '@/components/icons';
import { initials } from '@/components/profile-header';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Accent, FontFamily, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import {
  blockUser,
  type InboxFilter,
  type Notification,
  openTarget,
  TOGGLE_FOR,
  turnOffType,
  useAcceptShare,
  useInbox,
  useMarkAllRead,
} from '@/lib/notifications';

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'shared', label: 'Shared with me' },
  { key: 'study', label: 'Study' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Just now", "5 min ago", "2 hours ago", "Today, 7:30 PM", "Sunday", "12 Oct". */
function when(iso: string) {
  const t = new Date(iso);
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 6 * 60) return `${Math.round(mins / 60)} hour${mins < 90 ? '' : 's'} ago`;
  const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (new Date().toDateString() === t.toDateString()) return `Today, ${time}`;
  if (mins < 7 * 24 * 60) return DAYS[t.getDay()];
  return t.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** The actor's name in bold when the title starts with it ("**Ada O.** shared CSC 225…"). */
function Title({ n }: { n: Notification }) {
  const name = n.actor_name;
  if (name && n.title.startsWith(name)) {
    return (
      <Text variant="body">
        <Text variant="body" style={styles.bold}>
          {name}
        </Text>
        {n.title.slice(name.length)}
      </Text>
    );
  }
  return <Text variant="body">{n.title}</Text>;
}

function Row({ n, onLongPress }: { n: Notification; onLongPress: () => void }) {
  const theme = useTheme();
  const accept = useAcceptShare();
  const unread = !n.read_at;
  const pendingShare = n.type === 'course_shared' && n.target?.params?.memberId;
  return (
    <Pressable
      onPress={() => void openTarget(n)}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'New. ' : ''}${n.title}. ${when(n.created_at)}`}
      accessibilityHint="Opens it. Long-press for more options"
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.9 : 1 }]}>
      {n.actor_name ? (
        <View style={[styles.avatar, { backgroundColor: theme.text }]}>
          <Text variant="label" color="onInk">
            {initials(n.actor_name)}
          </Text>
        </View>
      ) : (
        <View style={[styles.avatar, { borderWidth: 1.5, borderColor: theme.line }]}>
          <Text variant="label">Q</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Title n={n} />
        {n.body && !n.title.includes(n.body) ? (
          <Text variant="small" color="textSecondary">
            {n.body}
          </Text>
        ) : null}
        <Text variant="small" color="textSecondary">
          {when(n.created_at)}
        </Text>
        {pendingShare && unread ? (
          accept.isSuccess ? (
            <Text variant="label" color="success">
              Added to your library
            </Text>
          ) : (
            <View style={styles.actions}>
              <Pill label={accept.isPending ? 'Adding…' : 'Add to library'} selected onPress={() => accept.mutate(String(n.target.params?.memberId))} />
              <Pill label="View" onPress={() => void openTarget(n)} />
            </View>
          )
        ) : null}
        {accept.isError ? <Banner message={friendlyError(accept.error)} /> : null}
      </View>
      {/* Unread dot: one of the places an accent may appear (DESIGN.md §3.2). */}
      {unread ? <View style={[styles.dot, { backgroundColor: Accent.lagoon }]} accessible={false} /> : null}
    </Pressable>
  );
}

// Screen 22 (DESIGN.md §7, FR-NOTIF-04): newest first, filters, unread dots, mark all read, and
// a pending share's "Add to library" inline. Long-press a row to block a person or turn a type off.
export default function NotificationsScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [menu, setMenu] = useState<Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inbox = useInbox(filter);
  const markAll = useMarkAllRead();
  const rows = inbox.data?.pages.flatMap((p) => p.notifications) ?? [];
  const unread = inbox.data?.pages[0]?.unread ?? 0;

  const act = (action: () => Promise<unknown>) => {
    setMenu(null);
    action().then(() => void inbox.refetch(), (e) => setError(friendlyError(e)));
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        onEndReached={() => inbox.hasNextPage && !inbox.isFetchingNextPage && void inbox.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topBar}>
              <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
              {unread ? <Pill label="Mark all read" onPress={() => markAll.mutate()} /> : null}
            </View>
            <View style={styles.titleRow}>
              <Text variant="display" accessibilityRole="header">
                Notifications
              </Text>
              {unread ? (
                <View style={[styles.newPill, { backgroundColor: theme.text }]}>
                  <Text variant="label" color="onInk">
                    {unread} new
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.filters} accessibilityRole="radiogroup">
              {FILTERS.map((f) => (
                <Pill key={f.key} label={f.label} role="radio" selected={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </View>
            {inbox.isError ? <Banner message={friendlyError(inbox.error)} /> : null}
            {error ? <Banner message={error} /> : null}
          </View>
        }
        renderItem={({ item }) => <Row n={item} onLongPress={() => setMenu(item)} />}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          inbox.isPending ? (
            <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
          ) : (
            <Text variant="body" color="textSecondary" style={styles.empty}>
              You&apos;re all caught up.
            </Text>
          )
        }
      />

      {menu ? (
        <Modal transparent animationType="fade" onRequestClose={() => setMenu(null)}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={() => setMenu(null)} accessible={false} />
          <View style={[styles.menu, { backgroundColor: theme.background }]}>
            {menu.actor_id && menu.actor_name ? (
              <TextButton label={`Block ${menu.actor_name}`} color="danger" onPress={() => act(() => blockUser(menu.actor_id!))} />
            ) : null}
            {TOGGLE_FOR[menu.type] ? (
              <TextButton label="Turn off this type" onPress={() => act(() => turnOffType(menu.type))} />
            ) : null}
            <TextButton label="Cancel" color="textSecondary" onPress={() => setMenu(null)} />
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter, paddingBottom: Spacing.six },
  header: { gap: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.three },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  newPill: { borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, alignItems: 'flex-start' },
  avatar: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 4 },
  bold: { fontFamily: FontFamily.bold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  gap: { height: Spacing.two },
  skeleton: { height: 96, borderRadius: Radius.card },
  empty: { textAlign: 'center', paddingVertical: Spacing.six },
  menu: { position: 'absolute', left: Spacing.gutter, right: Spacing.gutter, bottom: Spacing.six, borderRadius: Radius.sheet, padding: Spacing.three, gap: Spacing.one },
});
