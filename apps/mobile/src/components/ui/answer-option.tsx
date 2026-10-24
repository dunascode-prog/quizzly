import { Pressable, StyleSheet, View } from 'react-native';

import { Check, X } from '@/components/icons';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

export type OptionState = 'default' | 'selected' | 'correct' | 'wrong';

type Props = {
  letter: string;
  label: string;
  state: OptionState;
  onPress?: () => void;
  disabled?: boolean;
};

/** Answer row with a 48 letter circle (DESIGN.md §6): right/wrong uses an icon and a word. */
export function AnswerOption({ letter, label, state, onPress, disabled }: Props) {
  const theme = useTheme();
  const look = {
    default: { bg: theme.backgroundSelected, border: 'transparent', circle: theme.backgroundElement, fg: 'text' as const },
    selected: { bg: theme.text, border: theme.text, circle: theme.backgroundSelected, fg: 'onInk' as const },
    correct: { bg: theme.successSoft, border: theme.success, circle: theme.success, fg: 'text' as const },
    wrong: { bg: theme.dangerSoft, border: theme.danger, circle: theme.danger, fg: 'text' as const },
  }[state];
  const status = state === 'correct' ? ', correct answer' : state === 'wrong' ? ', your answer, wrong' : '';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: state === 'selected', disabled }}
      accessibilityLabel={`${letter}: ${label}${status}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: look.bg, borderColor: look.border, opacity: pressed && !disabled ? 0.85 : 1 },
      ]}>
      <View style={[styles.circle, { backgroundColor: look.circle }]}>
        {state === 'correct' ? (
          <Check size={22} color={theme.onInk} strokeWidth={3} />
        ) : state === 'wrong' ? (
          <X size={22} color={theme.onInk} strokeWidth={3} />
        ) : (
          <Text variant="label">
            {letter}
          </Text>
        )}
      </View>
      <Text variant="label" color={look.fg} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Size.field,
    borderRadius: Radius.option,
    borderWidth: 2,
    padding: Spacing.one + 2,
    paddingRight: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  circle: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 17 },
});
