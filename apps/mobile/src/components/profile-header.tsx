import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Me } from '@/lib/profile';

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** "UNILAG · 200L" */
export function schoolLine(me: Me | undefined) {
  const school = me?.institution?.short_name ?? me?.institution?.name ?? me?.institution_other;
  const level = me?.level === 'other' ? null : me?.level;
  return [school, level].filter(Boolean).join(' · ');
}

/** Initials avatar + two lines of text, used by the Library and Account headers. */
export function ProfileHeader({ me, title, ink = false }: { me: Me | undefined; title: string; ink?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View
        style={[styles.avatar, { backgroundColor: ink ? theme.text : theme.backgroundSelected }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants">
        <Text variant="label" color={ink ? 'onInk' : 'text'}>
          {initials(me?.full_name)}
        </Text>
      </View>
      <View style={styles.text}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="small" color="textSecondary" numberOfLines={1}>
          {schoolLine(me)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  avatar: {
    width: Size.iconButton,
    height: Size.iconButton,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: Spacing.half },
});
