import { StyleSheet, View } from 'react-native';

import { WifiOff } from '@/components/icons';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

/** What a social screen shows offline when nothing is saved on the phone (DESIGN.md §10: share,
 * invite and inbox actions say "Needs internet"). Offline queries pause rather than fail, so
 * without this the screen would wait on a skeleton forever. */
export function NeedsInternet({ what }: { what: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`Needs internet. ${what} will load when you're back online.`}>
      <View style={[styles.icon, { backgroundColor: theme.text }]}>
        <WifiOff size={22} color={theme.onInk} />
      </View>
      <View style={styles.text}>
        <Text variant="label">Needs internet</Text>
        <Text variant="small" color="textSecondary">
          {what} will load when you&apos;re back online. Saved notes still work.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card },
  icon: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
