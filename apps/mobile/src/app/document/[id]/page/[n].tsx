import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { usePage } from '@/lib/study';

// Source viewer (DESIGN.md §7, "not drawn"): the text of one page, opened from a citation chip.
// FR-DOC-10's in-app PDF rendering replaces this text view in a later PR.
export default function PageScreen() {
  const theme = useTheme();
  const { id, n } = useLocalSearchParams<{ id: string; n: string }>();
  const number = Number(n) || 1;
  const page = usePage(id, number);
  const count = page.data?.page_count ?? null;
  const go = (to: number) => router.setParams({ n: String(to) });

  return (
    <Screen
      footer={
        <View style={styles.nav}>
          {number > 1 ? <Pill label="Previous page" onPress={() => go(number - 1)} /> : <View />}
          {count === null || number < count ? <Pill label="Next page" onPress={() => go(number + 1)} /> : <View />}
        </View>
      }>
      <View style={styles.topBar}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text variant="label" accessibilityRole="header" style={styles.title}>
          Page {number}
          {count ? ` of ${count}` : ''}
        </Text>
        <View style={styles.spacer} />
      </View>

      {page.isError ? <Banner message={friendlyError(page.error)} /> : null}
      {page.isPending ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : page.data ? (
        <View style={[styles.sheet, { backgroundColor: theme.backgroundSelected }]}>
          <Text variant="reading" selectable>
            {page.data.text || 'This page has no text.'}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: 52 },
  sheet: { borderRadius: Radius.card, padding: Spacing.gutter },
  skeleton: { height: 320, borderRadius: Radius.card },
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
});
