import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useMyAvatar } from '@/lib/avatar';
import type { Me } from '@/lib/profile';

export { initials } from '@/components/ui/avatar';

/** "UNILAG · 200L" */
export function schoolLine(me: Me | undefined) {
  const school = me?.institution?.short_name ?? me?.institution?.name ?? me?.institution_other;
  const level = me?.level === 'other' ? null : me?.level;
  return [school, level].filter(Boolean).join(' · ');
}

/** The student's photo (or initials) + two lines of text: the Today, Library and Account headers
 * (02i). On Account the photo is bigger, carries the camera badge and opens the photo sheet. */
export function ProfileHeader({ me, title, account = false }: { me: Me | undefined; title: string; account?: boolean }) {
  const uri = useMyAvatar(me);
  return (
    <View style={styles.row}>
      <Avatar
        name={me?.full_name}
        uri={uri}
        size={account ? 76 : 52}
        badge={account}
        onPress={() => router.push(account ? '/profile/photo' : '/account')}
        accessibilityLabel={account ? (uri ? 'Change profile photo' : 'Add profile photo') : 'Your account'}
      />
      <View style={styles.text}>
        <Text variant="heading" numberOfLines={account ? 2 : 1}>
          {title}
        </Text>
        <Text variant="small" color="textSecondary" numberOfLines={2}>
          {account ? [schoolLine(me), me?.department].filter(Boolean).join(' · ') : schoolLine(me)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.half },
});
