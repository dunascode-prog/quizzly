import { Pressable, StyleSheet, View } from 'react-native';

import { Play } from '@/components/icons';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  title: string;
  meta: string;
  onPress: () => void;
  /** The first, suggested item: ink with a play button. */
  ink?: boolean;
  accessibilityHint?: string;
};

/** One item of "Today's plan" (DESIGN.md §6, 14). */
export function PlanRow({ title, meta, onPress, ink = false, accessibilityHint }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: ink ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View
        style={[
          styles.circle,
          ink ? { backgroundColor: theme.backgroundSelected } : { borderColor: theme.line, borderWidth: 2 },
        ]}>
        {ink ? <Play size={20} color={theme.text} fill={theme.text} /> : null}
      </View>
      <View style={styles.text}>
        <Text variant="label" color={ink ? 'onInk' : 'text'} style={styles.title}>
          {title}
        </Text>
        <Text variant="small" color={ink ? 'mutedOnInk' : 'textSecondary'}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.twoHalf,
    paddingRight: Spacing.four,
    borderRadius: Radius.option,
    minHeight: 64,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontFamily: FontFamily.bold },
});
