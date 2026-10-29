import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Ellipsis, X } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { RecapCard } from '@/components/ui/recap-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ToggleRow } from '@/components/ui/toggle-row';
import { NeedsInternet } from '@/components/ui/needs-internet';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { inviteLink } from '@/lib/links';
import { mondayOf, useRecap, weekLabel } from '@/lib/recap';
import { saveImage } from '@/lib/save-image';
import { useOnline } from '@/lib/network';

const SAVE_FAILED = "Couldn't save the image. Check that Quizzly can add to your photos.";
const SHARE_FAILED = "Couldn't share the image. Try again.";

// Screen 17 (DESIGN.md §7, FR-HAB-06): your week as an image to share on WhatsApp or a Story, or to
// save. The image is always light (§3.3); the … menu hides your name and school on it.
export default function RecapScreen() {
  const theme = useTheme();
  const { week } = useLocalSearchParams<{ week: string }>();
  const monday = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : mondayOf();
  const recap = useRecap(monday);
  const card = useRef<View>(null);
  const [menu, setMenu] = useState(false);
  const [hidden, setHidden] = useState<boolean | null>(null); // null: follow the privacy setting
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = recap.data;
  const online = useOnline();
  const showIdentity = hidden === null ? (r?.show_identity ?? true) : !hidden;

  const capture = () => captureRef(card, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });

  const share = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const uri = await capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your week' });
    } catch {
      setMessage(SHARE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveImage(await capture());
      setMessage('Saved to your photos.');
    } catch {
      setMessage(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const native = Platform.OS !== 'web';

  return (
    <Screen>
      <View style={styles.head}>
        <IconButton icon={X} accessibilityLabel="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text variant="body" color="textSecondary" style={styles.title} accessibilityRole="header">
          Your week{r ? ` · ${weekLabel(r.week_start, r.week_end)}` : ''}
        </Text>
        <IconButton icon={Ellipsis} accessibilityLabel="Recap options" onPress={() => setMenu(!menu)} />
      </View>
      {menu ? (
        <ToggleRow
          label="Show my name and school"
          helper="On this image only. Change the default in Privacy."
          value={showIdentity}
          onChange={(v) => setHidden(!v)}
        />
      ) : null}
      {recap.isError ? <Banner message={friendlyError(recap.error)} /> : null}
      {!online && !r ? <NeedsInternet what="Your week" /> : null}

      {r ? (
        <RecapCard ref={card} recap={r} showIdentity={showIdentity} link={r.invite_code ? inviteLink(r.invite_code) : null} />
      ) : online ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : null}

      {message ? (
        <Text variant="small" color="textSecondary" style={styles.center} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}

      {r && native ? (
        // ShareTargets (DESIGN.md §6): the share sheet lists WhatsApp and Status first on most phones.
        <View style={styles.targets}>
          <View style={styles.flex}>
            <Pill label="WhatsApp" selected onPress={() => !busy && void share()} accessibilityLabel="Share on WhatsApp" />
          </View>
          <View style={styles.flex}>
            <Pill label="Story" onPress={() => !busy && void share()} accessibilityLabel="Share to your Status or Story" />
          </View>
          <View style={styles.flex}>
            <Pill label="Save image" onPress={() => !busy && void save()} />
          </View>
        </View>
      ) : r ? (
        <Text variant="small" color="textSecondary" style={styles.center}>
          Open Quizzly on your phone to share or save this image.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1, textAlign: 'center' },
  center: { textAlign: 'center' },
  skeleton: { width: '100%', aspectRatio: 9 / 16, borderRadius: Radius.hero },
  targets: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
