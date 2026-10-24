import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronLeft, FileText } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
import { type Topic, useOutline } from '@/lib/study';

function TopicRow({ topic, onPress }: { topic: Topic; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Topic ${topic.ordinal + 1}: ${topic.title}${topic.page_start ? `, from page ${topic.page_start}` : ''}`}
      accessibilityHint={topic.summary ?? 'Opens the explanation'}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.number, { backgroundColor: theme.backgroundElement }]}>
        <Text variant="label">{topic.ordinal + 1}</Text>
      </View>
      <Text variant="label" style={styles.rowTitle}>
        {topic.title}
      </Text>
      {topic.page_start ? (
        <Text variant="small" color="textSecondary">
          p. {topic.page_start}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Screen 06 (DESIGN.md §7): the document's outline on a dark detail screen (FR-TOP-01).
export default function OutlineScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const outline = useOutline(id);
  const doc = outline.data?.document;

  return (
    <View style={[styles.root, { backgroundColor: theme.text }]}>
      {/* The ink background is dark in light mode and light in dark mode. */}
      <StatusBar style={scheme === 'dark' ? 'dark' : 'light'} />
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.inner}>
          <View style={styles.topBar}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
            <IconButton
              icon={FileText}
              accessibilityLabel="View original pages"
              onPress={() => router.push({ pathname: '/document/[id]/page/[n]', params: { id, n: '1' } })}
            />
          </View>
          <Text variant="display" color="onInk" accessibilityRole="header">
            {doc?.title ?? ' '}
          </Text>
          <Text variant="body" color="mutedOnInk">
            {doc
              ? [doc.course_code, doc.page_count ? plural(doc.page_count, 'page') : null, plural(doc.topic_count, 'topic')]
                  .filter(Boolean)
                  .join(' · ')
              : ' '}
          </Text>
          <View style={styles.pills}>
            <Pressable
              onPress={() => router.push({ pathname: '/quiz/new', params: { documentId: id } })}
              accessibilityRole="button"
              accessibilityLabel="Practise with a quiz"
              style={({ pressed }) => [styles.pill, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
              <Text variant="label">Practise</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/document/[id]/chat', params: { id } })}
              accessibilityRole="button"
              accessibilityLabel="Ask your notes"
              accessibilityHint="Chat about this document; answers cite its pages"
              style={({ pressed }) => [styles.pill, { borderWidth: 1.5, borderColor: theme.track, opacity: pressed ? 0.7 : 1 }]}>
              <Text variant="label" color="onInk">
                Ask your notes
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={[styles.inner, styles.sheetBody]}>
          <Text variant="title" accessibilityRole="header">
            Topics
          </Text>
          {outline.isError ? <Banner message={friendlyError(outline.error)} /> : null}
          {doc && doc.low_ocr_pages.length > 0 ? (
            <Banner
              tone="warning"
              message={`Some pages were hard to read: p. ${doc.low_ocr_pages.join(', ')}. Check them against your notes.`}
            />
          ) : null}
          {outline.isPending
            ? [0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />)
            : outline.data?.topics.map((t) => (
                <TopicRow
                  key={t.id}
                  topic={t}
                  onPress={() => router.push({ pathname: '/document/[id]/topic/[topicId]', params: { id, topicId: t.id } })}
                />
              ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: Spacing.four },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter, gap: Spacing.three },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.four, marginBottom: Spacing.two },
  pills: { flexDirection: 'row', gap: Spacing.twoHalf, marginTop: Spacing.two },
  pill: { flex: 1, minHeight: Size.actionPill - 8, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, overflow: 'hidden' },
  sheetBody: { paddingTop: Spacing.four, paddingBottom: Spacing.six },
  row: {
    minHeight: Size.field + 12,
    borderRadius: Radius.option + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  number: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flex: 1, fontSize: 17 },
  skeleton: { height: 76, borderRadius: Radius.option + 2 },
});
