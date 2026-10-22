import { Pressable, StyleSheet } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

/** Outlined "p. 12" pill that opens the source page (DESIGN.md §6, FR-DOC-10). */
export function CitationChip({ page, onPress }: { page: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`Source: page ${page}`}
      accessibilityHint="Opens that page of your notes"
      hitSlop={12}
      style={({ pressed }) => [styles.chip, { borderColor: theme.text, opacity: pressed ? 0.6 : 1 }]}>
      <Text variant="caption" style={styles.label}>
        p. {page}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 26,
    paddingHorizontal: 9,
    borderWidth: 1.5,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    transform: [{ translateY: 5 }],
  },
  label: { fontSize: 13 },
});
