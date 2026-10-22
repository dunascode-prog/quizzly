import { Pressable, StyleSheet, View } from 'react-native';

import type { LucideIcon } from '@/components/icons';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ProgressRing } from './progress-ring';
import { Text } from './text';

type Props = {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  /** `ink` is the screen's primary action; `light` is secondary. */
  variant?: 'ink' | 'light';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

/** The one main action per screen, pinned at the bottom (DESIGN.md §6). */
export function ActionPill({
  label,
  icon: Icon,
  onPress,
  variant = 'ink',
  loading = false,
  disabled = false,
  accessibilityHint,
}: Props) {
  const theme = useTheme();
  const ink = variant === 'ink';
  const fill = ink ? theme.text : theme.backgroundSelected;
  const circle = ink ? theme.backgroundSelected : theme.text;
  const iconColor = ink ? theme.text : theme.onInk;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: fill, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.circle, { backgroundColor: circle }]}>
        {loading ? (
          <ProgressRing size={36} strokeWidth={3} color={ink ? 'text' : 'onInk'} trackColor="line" />
        ) : (
          <Icon size={24} color={iconColor} strokeWidth={2} />
        )}
      </View>
      <Text variant="label" color={ink ? 'onInk' : 'text'} style={styles.label}>
        {label}
      </Text>
      <Text
        variant="label"
        color={ink ? 'mutedOnInk' : 'textSecondary'}
        style={styles.chevrons}
        accessible={false}
        importantForAccessibility="no">
        ›››
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: Size.actionPill,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    padding: (Size.actionPill - Size.iconButton) / 2,
  },
  circle: {
    width: Size.iconButton,
    height: Size.iconButton,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    paddingHorizontal: Spacing.two,
  },
  chevrons: {
    width: Size.iconButton,
    textAlign: 'center',
    letterSpacing: -2,
  },
});
