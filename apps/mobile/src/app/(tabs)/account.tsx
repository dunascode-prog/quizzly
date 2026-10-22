import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { LogOut } from '@/components/icons';
import { ProfileHeader } from '@/components/profile-header';
import { Banner } from '@/components/ui/banner';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useMe } from '@/lib/profile';

// Screen 13 (DESIGN.md §7). Usage tiles, profile editing and account deletion come with
// FR-LIM-01, FR-PROF and FR-AUTH-05.
export default function AccountScreen() {
  const theme = useTheme();
  const me = useMe();
  const [error, setError] = useState<string | null>(null);

  const onSignOut = () => {
    setError(null);
    signOut().catch((e) => setError(friendlyError(e)));
  };

  return (
    <Screen bottomInset={BottomTabInset}>
      <ProfileHeader me={me.data} title={me.data?.full_name ?? 'Your account'} ink />
      {me.data?.email ? (
        <Text variant="small" color="textSecondary">
          Signed in as {me.data.email}
        </Text>
      ) : null}

      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
        <LogOut size={22} color={theme.text} strokeWidth={2} />
        <Text variant="label" style={styles.rowText}>
          Sign out
        </Text>
      </Pressable>
      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Size.field,
    borderRadius: Radius.field,
    paddingHorizontal: Spacing.gutter - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  rowText: { flex: 1 },
});
