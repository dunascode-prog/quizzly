import { Pressable, StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { Accent, type AccentName, Colors, CourseAccentOrder, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

const NAMES: Record<AccentName, string> = { lagoon: 'Lagoon', ankara: 'Ankara', palm: 'Palm', lavender: 'Lavender' };

/** A course's accent colour, used only for its rings and dots (FR-CRS-05, DESIGN.md §3.2). */
export function AccentSwatches({ value, onChange }: { value: AccentName; onChange: (a: AccentName) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="textSecondary">
        Accent colour
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
        {CourseAccentOrder.map((name) => {
          const selected = name === value;
          return (
            <Pressable
              key={name}
              onPress={() => onChange(name)}
              accessibilityRole="radio"
              accessibilityLabel={NAMES[name]}
              accessibilityState={{ checked: selected }}
              style={[styles.target, selected && { borderColor: theme.text }]}>
              <View style={[styles.swatch, { backgroundColor: Accent[name] }]}>
                {/* Text and icons on an accent are always ink, in both themes (DESIGN.md §3.2). */}
                {selected ? <Check size={20} color={Colors.light.text} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  target: {
    width: Size.iconButton,
    height: Size.iconButton,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: Size.iconButton - 10,
    height: Size.iconButton - 10,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
