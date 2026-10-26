import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { usePage, usePageImage } from '@/lib/study';

// Source viewer (DESIGN.md §7, "not drawn"; FR-DOC-10): the page as uploaded, opened from a
// citation chip, with its text one tap away. Slides, or no connection, show the text alone.
// Shared-course members get the quote view instead (FR-SHARE-02).

/** Width ÷ height of the image, once known, so it fills the width without cropping. */
function useAspect(url: string | null | undefined) {
  const [aspect, setAspect] = useState<{ url: string; ratio: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    Image.getSize(
      url,
      (w, h) => live && h > 0 && setAspect({ url, ratio: w / h }),
      () => live && setAspect({ url, ratio: 0 }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return url && aspect?.url === url ? aspect.ratio : null;
}
export default function PageScreen() {
  const theme = useTheme();
  const { id, n } = useLocalSearchParams<{ id: string; n: string }>();
  const number = Number(n) || 1;
  const page = usePage(id, number);
  const image = usePageImage(id, number);
  const url = image.data?.url;
  const ratio = useAspect(url);
  const failed = image.isError || ratio === 0;
  const hasImage = !!url && !failed;
  const waiting = image.isPending || (hasImage && !ratio);
  const [showText, setShowText] = useState(false);
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
      {hasImage && ratio ? (
        <Image
          source={{ uri: url }}
          resizeMode="contain"
          style={[styles.image, { aspectRatio: ratio, backgroundColor: theme.backgroundSelected }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Page ${number} of your notes. Show the page text to read it aloud.`}
        />
      ) : null}
      {waiting ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : null}
      {hasImage && page.data ? (
        <TextButton label={showText ? 'Hide page text' : 'Show page text'} onPress={() => setShowText(!showText)} />
      ) : null}
      {(hasImage || waiting) && !showText ? null : page.isPending ? (
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
  image: { width: '100%', borderRadius: Radius.card },
  skeleton: { height: 320, borderRadius: Radius.card },
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
});
