import { StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

/** One feature: a bold verb, then the rest of the line ("**Upload** slides or note photos"). */
export type Feature = { verb: string; rest: string };

/** Ticked lines inside an ink card, written like a short write-up (DESIGN.md §6; 01, 20, 24). */
export function FeatureList({ items, compact = false }: { items: Feature[]; compact?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.list, compact && styles.listCompact]}>
      {items.map((f) => (
        <View key={f.verb} style={styles.row}>
          <View style={[styles.tick, { backgroundColor: theme.backgroundSelected }]}>
            <Check size={14} color={theme.text} strokeWidth={3} />
          </View>
          <Text variant="body" color="inactiveOnInk" style={[styles.text, compact && styles.textCompact]}>
            <Text variant="body" color="onInk" style={[styles.verb, compact && styles.textCompact]}>
              {f.verb}
            </Text>{' '}
            {f.rest}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  listCompact: { gap: 7 }, // small phones (DESIGN.md §7 01)
  textCompact: { fontSize: 14, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tick: { width: 26, height: 26, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 15, lineHeight: 21 },
  verb: { fontFamily: FontFamily.bold, fontSize: 15, lineHeight: 21 },
});
