import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { X } from '@/components/icons';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { HighlightText } from './highlight-text';
import { IconButton } from './icon-button';
import { Text } from './text';

type Props = {
  title: string;
  /** The word of the title on the ink block, e.g. the course code. */
  highlight?: string;
  onClose: () => void;
  children: ReactNode;
  /** Shown before the title, e.g. a topic's number circle (screen 27a). */
  leading?: ReactNode;
  /** A line under the title. */
  subtitle?: string;
};

/** Body of a formSheet route: title + close button, sized to its content (DESIGN.md §7, 04). */
export function Sheet({ title, highlight, onClose, children, leading, subtitle }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        {leading}
        <View style={styles.title}>
          {highlight ? (
            <HighlightText variant="title" highlight={highlight}>
              {title}
            </HighlightText>
          ) : (
            <Text variant={leading ? 'heading' : 'title'} accessibilityRole="header">
              {title}
            </Text>
          )}
          {subtitle ? (
            <Text variant="body" color="textSecondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
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
