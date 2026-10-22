import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: ReactNode;
  /** Pinned below the scroll area, above the keyboard: the screen's ActionPill. */
  footer?: ReactNode;
  /** Extra bottom space for screens under the floating tab bar. */
  bottomInset?: number;
  /**
   * Lay the body out in exactly one screen height instead of scrolling, so a flexible child
   * (e.g. an illustration) can shrink and everything stays visible. Falls back to scrolling
   * with large system text, where fitting would cut content off.
   */
  fit?: boolean;
};

const FIT_MAX_FONT_SCALE = 1.3;

/** Ground background, safe areas, 20 px gutters and a scrollable body (DESIGN.md §5). */
export function Screen({ children, footer, bottomInset = 0, fit = false }: Props) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const fixed = fit && fontScale <= FIT_MAX_FONT_SCALE;
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {fixed ? (
          <View style={[styles.content, styles.fixed, { paddingBottom: Spacing.two + bottomInset }]}>{children}</View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: Spacing.five + bottomInset }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive">
            {children}
          </ScrollView>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  fixed: {
    flex: 1,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.twoHalf,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
});
