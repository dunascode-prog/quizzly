import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRight, type LucideIcon, LogOut } from '@/components/icons';
import { ProfileHeader } from '@/components/profile-header';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { BottomTabInset, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { type Allowance, useUsage } from '@/lib/library';
import { unregisterPush } from '@/lib/notifications';
import { useMe } from '@/lib/profile';

/** One allowance on the ink card: what's left today out of the daily limit. */
function Tile({ label, allowance }: { label: string; allowance: Allowance | undefined }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.inkRaised }]}
      accessible
      accessibilityLabel={allowance ? `${label}: ${allowance.remaining} of ${allowance.limit} left today` : `${label}: loading`}>
      <Text variant="small" color="mutedOnInk">
        {label}
      </Text>
      <View style={styles.count}>
        <Text variant="display" color="onInk">
          {allowance ? allowance.remaining : '–'}
        </Text>
        <Text variant="body" color="mutedOnInk">
          / {allowance?.limit ?? '–'}
        </Text>
      </View>
    </View>
  );
}

function Row({ label, icon: Icon, onPress, hint }: { label: string; icon: LucideIcon; onPress: () => void; hint?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.8 : 1 }]}>
      <Text variant="label" style={styles.rowText}>
        {label}
      </Text>
      <Icon size={22} color={theme.text} strokeWidth={2} />
    </Pressable>
  );
}

// Screen 13 (DESIGN.md §7): profile, what's left of today's limits (FR-LIM-01), privacy and terms,
// sign out (FR-AUTH-04) and account deletion (FR-AUTH-05).
export default function AccountScreen() {
  const me = useMe();
  const usage = useUsage();
  const { refetch } = usage;
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const u = usage.data;

  const onSignOut = () => {
    setError(null);
    // Stop this phone's pushes first, while we can still prove who we are.
    unregisterPush()
      .then(signOut)
      .catch((e) => setError(friendlyError(e)));
  };

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <ProfileHeader me={me.data} title={me.data?.full_name ?? 'Your account'} ink />
        </View>
        <Pill label="Edit" accessibilityLabel="Edit your profile" onPress={() => router.push('/profile/edit')} />
      </View>

      <HighlightText highlight="today">Left today</HighlightText>
      <HeroCard style={styles.card}>
        <View style={styles.tiles}>
          <Tile label="Uploads" allowance={u?.uploads} />
          <Tile label="Quizzes" allowance={u?.question_sets} />
        </View>
        <View style={styles.tiles}>
          <Tile label="Explanations" allowance={u?.explanations} />
          <Tile label="Chat" allowance={u?.chat_messages} />
        </View>
      </HeroCard>
      <Text variant="small" color="textSecondary">
        {u ? `Answer markings: ${u.markings.remaining} of ${u.markings.limit} left. ` : ''}Everything resets at 12:00 AM.
      </Text>
      {usage.isError ? <Banner message={friendlyError(usage.error)} /> : null}

      <View style={styles.rows}>
        <Row label="Privacy and terms" icon={ChevronRight} onPress={() => router.push('/legal')} />
        <Row label="Sign out" icon={LogOut} onPress={onSignOut} hint={me.data?.email ? `Signed in as ${me.data.email}` : undefined} />
      </View>
      {error ? <Banner message={error} /> : null}
      <TextButton label="Delete account" color="danger" onPress={() => router.push('/account/delete')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  card: { padding: Spacing.twoHalf, gap: Spacing.twoHalf },
  tiles: { flexDirection: 'row', gap: Spacing.twoHalf },
  tile: { flex: 1, borderRadius: Radius.option, padding: Spacing.three, gap: Spacing.one },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one, flexWrap: 'wrap' },
  rows: { gap: Spacing.twoHalf },
  row: {
    minHeight: Size.field,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  rowText: { flex: 1 },
});
