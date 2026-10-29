import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
   * Size the body to exactly one screen (measured with the keyboard closed), so a flexible
   * child such as an illustration shrinks and everything shows without scrolling. When the
   * keyboard opens the body scrolls, and jumps to its end, where the input sits.
   */
  fit?: boolean;
};

/** Ground background, safe areas, 20 px gutters and a scrollable body (DESIGN.md §5). */
export function Screen({ children, footer, bottomInset = 0, fit = false }: Props) {
  const theme = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // The tallest the scroll area has been is its height with the keyboard closed (portrait only).
  const [fitHeight, setFitHeight] = useState(0);

  useEffect(() => {
    if (!fit) return;
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, [fit]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          onLayout={
            fit
              ? (e) => {
                  // Read now: native recycles the event before a state updater runs.
                  const { height } = e.nativeEvent.layout;
                  setFitHeight((h) => Math.max(h, height));
                }
              : undefined
          }
          contentContainerStyle={[
            styles.content,
            fit
              ? { minHeight: fitHeight || undefined, paddingBottom: Spacing.two + bottomInset }
              : { paddingBottom: Spacing.five + bottomInset },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          {children}
        </ScrollView>
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
