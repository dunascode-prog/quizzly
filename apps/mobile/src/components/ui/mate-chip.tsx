import { Pressable, StyleSheet, View } from 'react-native';

import { initials } from '@/components/profile-header';
import { Avatar } from '@/components/ui/avatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = { name: string; selected: boolean; onPress: () => void; avatarUrl?: string | null };

/** A coursemate to send the course to (DESIGN.md §6, screen 19): 52 pill, initials + first name;
 * selected is ink. Multi-select. */
export function MateChip({ name, selected, onPress, avatarUrl }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 },
      ]}>
      {avatarUrl ? (
        <Avatar name={name} uri={avatarUrl} size={40} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement }]}>
          <Text variant="caption" color="text">
            {initials(name)}
          </Text>
        </View>
      )}
      <Text variant="label" color={selected ? 'onInk' : 'text'}>
        {name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

/** Up to 3 overlapping faces (an empty name is a blank face: members' names stay private) + "12 coursemates are studying this" (shown only from 3). */
export function AvatarStack({ names, count, onInk = false }: { names: string[]; count: number; onInk?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.stack} accessible accessibilityLabel={`${count} coursemates are studying this`}>
      <View style={styles.faces}>
        {names.slice(0, 3).map((n, i) => (
          <View
            key={`${n}${i}`}
            style={[
              styles.face,
              { backgroundColor: i === 0 ? theme.backgroundSelected : theme.line, borderColor: onInk ? theme.text : theme.background, marginLeft: i ? -8 : 0 },
            ]}>
            <Text variant="caption" color="text">
              {n ? initials(n) : ''}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="body" color={onInk ? 'onInk' : 'text'} style={styles.flex}>
        {count} coursemates are studying this
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 52, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: 6, paddingRight: Spacing.three },
  avatar: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  faces: { flexDirection: 'row' },
  face: { width: 32, height: 32, borderRadius: Radius.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
