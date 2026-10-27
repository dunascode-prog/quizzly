import { Pressable, StyleSheet } from 'react-native';

import { Size, Spacing, type ThemeColor } from '@/constants/theme';

import { Text } from './text';

type Props = {
  label: string;
  onPress: () => void;
  color?: ThemeColor;
  disabled?: boolean;
  /** Smaller, for two buttons side by side. */
  compact?: boolean;
};

/** Plain text action ("Continue with Google", "Use a different email"). */
export function TextButton({ label, onPress, color = 'text', disabled, compact }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.button, compact && styles.compact, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}>
      <Text variant="label" color={color} style={[styles.label, compact && styles.compactLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Size.minTouch,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  label: {
    fontSize: 17,
    textAlign: 'center',
  },
  compact: { paddingHorizontal: Spacing.two },
  compactLabel: { fontSize: 15 },
});
