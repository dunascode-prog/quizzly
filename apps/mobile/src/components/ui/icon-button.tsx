import { Pressable, StyleSheet } from 'react-native';

import type { LucideIcon } from '@/components/icons';
import { Radius, Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress: () => void;
  tone?: 'light' | 'ink';
  disabled?: boolean;
};

export function IconButton({ icon: Icon, accessibilityLabel, onPress, tone = 'light', disabled }: Props) {
  const theme = useTheme();
  const ink = tone === 'ink';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: ink ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Icon size={24} color={ink ? theme.onInk : theme.text} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Size.iconButton,
    height: Size.iconButton,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
