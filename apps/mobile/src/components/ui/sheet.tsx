import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { X } from '@/components/icons';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from './icon-button';
import { Text } from './text';

type Props = { title: string; onClose: () => void; children: ReactNode };

/** Body of a formSheet route: title + close button, sized to its content (DESIGN.md §7, 04). */
export function Sheet({ title, onClose, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { flex: 1 },
});
