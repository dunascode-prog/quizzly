import { StyleSheet, View } from 'react-native';

import { Check, Lock } from '@/components/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

/** "THEY GET" with ticks and "STAYS PRIVATE" with locks (DESIGN.md §6; screens 19, 20). */
export function PrivacyList({ get, private: kept }: { get: string[]; private: string[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
      <Text variant="caption" color="textSecondary" style={styles.caption}>
        THEY GET
      </Text>
      {get.map((line) => (
        <View key={line} style={styles.row}>
          <Check size={22} color={theme.success} strokeWidth={2.5} />
          <Text variant="body" style={styles.flex}>
            {line}
          </Text>
        </View>
      ))}
      <View style={[styles.rule, { backgroundColor: theme.line }]} />
      <Text variant="caption" color="textSecondary" style={styles.caption}>
        STAYS PRIVATE
      </Text>
      {kept.map((line) => (
        <View key={line} style={styles.row}>
          <Lock size={20} color={theme.textSecondary} />
          <Text variant="body" color="textSecondary" style={styles.flex}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.three },
  caption: { letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  rule: { height: 1, marginVertical: Spacing.one },
});
