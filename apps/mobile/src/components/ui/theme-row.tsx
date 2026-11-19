import { Pressable, StyleSheet, View } from 'react-native';

import { Check, Lock } from '@/components/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  name: string;
  rule: string;
  /** The swatch colour; Ink uses the theme's own ink. */
  color: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
};

/** One theme (DESIGN.md §6, screen 18): 40 swatch, name and unlock rule, a check when chosen or a
 * lock (disabled, saying how to unlock it). The chosen row has a 2 px ink border. */
export function ThemeRow({ name, rule, color, selected, locked, onPress }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      accessibilityRole="radio"
      accessibilityLabel={`${name}. ${rule}`}
      accessibilityState={{ checked: selected, disabled: locked }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundSelected, borderColor: selected ? theme.text : 'transparent', opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.swatch, { backgroundColor: color, opacity: locked ? 0.45 : 1 }]} />
      <View style={styles.text}>
        <Text variant="label">{name}</Text>
        <Text variant="small" color="textSecondary">
          {rule}
        </Text>
      </View>
      {selected ? <Check size={22} color={theme.text} strokeWidth={2.5} /> : locked ? <Lock size={20} color={theme.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option, borderWidth: 2 },
  swatch: { width: 40, height: 40, borderRadius: Radius.full },
  text: { flex: 1, gap: 2 },
});
