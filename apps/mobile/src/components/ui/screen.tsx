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
  /**
   * No scrolling at all: the body is exactly the space between the safe area and the footer, so a
   * flexible child (the sign-in illustration) gets only what is truly left and nothing can end up
   * under the footer. Use only for screens without text inputs.
   */
  fixed?: boolean;
};

/** Ground background, safe areas, 20 px gutters and a scrollable body (DESIGN.md §5). */
export function Screen({ children, footer, bottomInset = 0, fit = false, fixed = false }: Props) {
  const theme = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // The scroll area's height while the keyboard is closed. Always the latest value, never the
  // tallest: the first layout can happen before the footer or the safe-area insets are in place,
  // and keeping that taller value pushed the content under the footer (sign-in card clipped).
  const [fitHeight, setFitHeight] = useState(0);
  const keyboardOpen = useRef(false);

  useEffect(() => {
    if (!fit) return;
    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
        keyboardOpen.current = true;
      }),
      Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true })),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
        keyboardOpen.current = false;
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [fit]);

  const body = fixed ? (
    <View style={[styles.content, styles.fixed, { paddingBottom: Spacing.two + bottomInset }]}>{children}</View>
  ) : (
    <ScrollView
      ref={scroll}
      onLayout={
        fit
          ? (e) => {
              // Read now: native recycles the event before a state updater runs.
              const { height } = e.nativeEvent.layout;
              if (!keyboardOpen.current && !Keyboard.isVisible()) setFitHeight(height);
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
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
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
  // Fills the space above the footer and clips instead of overflowing into it.
  fixed: { flex: 1, overflow: 'hidden' },
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
