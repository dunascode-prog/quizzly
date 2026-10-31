import { Pressable, StyleSheet } from 'react-native';

import { Lock } from '@/components/icons';

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
  /** A paid-plan option shown to a free student (FR-PLAN-04): a padlock before the label. */
  locked?: boolean;
};

export function Pill({ label, onPress, selected = false, role = 'button', accessibilityLabel, locked }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={(accessibilityLabel ?? label) + (locked ? ', on Student and Premium' : '')}
      accessibilityHint={locked ? 'Opens the plans' : undefined}
      accessibilityState={role === 'button' ? undefined : { checked: selected }}
      hitSlop={(Size.minTouch - Size.pill) / 2}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.8 : 1 },
      ]}>
      {locked ? <Lock size={16} color={theme.textSecondary} strokeWidth={2.5} /> : null}
      <Text variant="label" color={selected ? 'onInk' : locked ? 'textSecondary' : 'text'}>
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
    flexDirection: 'row',
    gap: Spacing.one + 2,
  },
});
