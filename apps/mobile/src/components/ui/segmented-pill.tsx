import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Ink track; the selected segment is a field-coloured pill (DESIGN.md §6). */
export function SegmentedPill<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.text }]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
            <Text variant="label" color={selected ? 'text' : 'inactiveOnInk'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: Radius.full, padding: 5 },
  segment: {
    flex: 1,
    minHeight: Size.minTouch,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
