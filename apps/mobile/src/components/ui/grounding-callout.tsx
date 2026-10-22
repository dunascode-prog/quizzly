import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

/** Dashed amber frame for anything not from the student's notes (DESIGN.md §6, FR-EXPL-03). */
export function GroundingCallout({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: theme.warning }]} accessibilityRole="summary">
      <Text variant="caption" color="warning" style={styles.label}>
        NOT IN YOUR NOTES
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingHorizontal: Spacing.gutter - 2,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  label: { letterSpacing: 0.8 },
});
