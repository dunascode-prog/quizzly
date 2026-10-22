import { Pressable, StyleSheet } from 'react-native';

import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  label: string;
  onPress: () => void;
  selected?: boolean;
  /** Use `radio` for single-choice groups and `checkbox` for multi-select. */
  role?: 'button' | 'radio' | 'checkbox';
  accessibilityLabel?: string;
};

export function Pill({ label, onPress, selected = false, role = 'button', accessibilityLabel }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === 'button' ? undefined : { checked: selected }}
      hitSlop={(Size.minTouch - Size.pill) / 2}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Text variant="label" color={selected ? 'onInk' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: Size.pill + 4,
    minWidth: 72,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
