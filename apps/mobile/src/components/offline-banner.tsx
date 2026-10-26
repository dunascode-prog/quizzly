import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WifiOff } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnline } from '@/lib/network';

/** Ink pill while the device is offline (DESIGN.md §6 Banner, §10 Offline). It floats just above
 * the bottom action pill or tab bar, so it never covers the close and report buttons. */
export function OfflineBanner() {
  const theme = useTheme();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + Size.tabBar + Spacing.four + Spacing.three }]}>
      <View
        style={[styles.pill, { backgroundColor: theme.text }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite">
        <WifiOff size={18} color={theme.onInk} strokeWidth={2} />
        <Text variant="small" color="onInk">
          You&apos;re offline. Saved notes still work.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
