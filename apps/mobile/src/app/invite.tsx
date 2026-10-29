import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Check, ChevronLeft } from '@/components/icons';
import { initials } from '@/components/profile-header';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { NeedsInternet } from '@/components/ui/needs-internet';
import { Accent, Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { useOnline } from '@/lib/network';

type Invite = {
  code: string;
  link: string;
  friends: { display_name: string | null; credited_at: string }[];
  credited: number;
  next_reward: { theme: string; at: number } | null;
  lavender_unlocked: boolean;
};

const QR = 112;

// Screen 23 (DESIGN.md §7, FR-INV-01/04/05): your invite link with Copy and a QR code, share
// buttons, and the friends who joined on the way to the Lavender theme.
export default function InviteScreen() {
  const theme = useTheme();
  const invite = useQuery({
    queryKey: ['invite'],
    queryFn: () => apiFetch<Invite>('/v1/me/invite'),
    enabled: Boolean(useAuth((s) => s.session)),
  });
  const [copied, setCopied] = useState(false);
  const online = useOnline();
  const i = invite.data;
  const message = i ? `I study with Quizzly: it turns lecture slides into explanations and exam questions. Join me: ${i.link}` : '';
  const goal = i?.next_reward?.at ?? 3;
  const left = Math.max(0, goal - (i?.credited ?? 0));

  const copy = async () => {
    if (!i) return;
    await Clipboard.setStringAsync(i.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="friends">Study with your friends</HighlightText>
      {invite.isError ? <Banner message={friendlyError(invite.error)} /> : null}
      {!online && !invite.data ? <NeedsInternet what="Your invite link" /> : null}

      {i ? (
        <>
          {/* LinkCard (DESIGN.md §6). */}
          <HeroCard style={styles.linkCard}>
            <View style={styles.flex}>
              <Text variant="small" color="mutedOnInk">
                Your invite link
              </Text>
              <Text variant="label" color="onInk" selectable style={styles.link}>
                {i.link.replace(/^https?:\/\//, '')}
              </Text>
              <Text variant="small" color="mutedOnInk">
                Opens the app, or the download page if they don&apos;t have it.
              </Text>
              <Pressable
                onPress={() => void copy()}
                accessibilityRole="button"
                accessibilityLabel={copied ? 'Copied' : 'Copy link'}
                style={[styles.copy, { backgroundColor: copied ? Accent.lagoon : theme.backgroundSelected }]}>
                {/* Text on an accent is always ink (DESIGN.md §3.2). */}
                {copied ? <Check size={18} color={Colors.light.text} /> : null}
                <Text variant="label" style={copied ? { color: Colors.light.text } : undefined}>
                  {copied ? 'Copied' : 'Copy link'}
                </Text>
              </Pressable>
            </View>
            <View
              style={[styles.qr, { backgroundColor: theme.backgroundSelected }]}
              accessible
              accessibilityRole="image"
              accessibilityLabel="QR code for your invite link">
              <QRCode value={i.link} size={QR} color={theme.text} backgroundColor={theme.backgroundSelected} />
            </View>
          </HeroCard>

          {/* ShareTargets (DESIGN.md §6). */}
          <View style={styles.targets}>
            <View style={styles.flex}>
              <Pill label="WhatsApp" selected onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`)} />
            </View>
            <View style={styles.flex}>
              <Pill label="Status / Story" onPress={() => void Share.share({ message })} />
            </View>
            <View style={styles.flex}>
              <Pill label="More" onPress={() => void Share.share({ message, url: i.link })} />
            </View>
          </View>

          {/* InviteProgress (DESIGN.md §6, FR-INV-04/05). */}
          <View style={[styles.progress, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.progressHead}>
              <ProgressRing
                size={60}
                strokeWidth={6}
                value={Math.min(1, i.credited / goal)}
                accent={Accent.lavender}
                trackColor="line"
                label={`${Math.min(i.credited, goal)} of ${goal} friends`}>
                <Text variant="label">
                  {Math.min(i.credited, goal)}/{goal}
                </Text>
              </ProgressRing>
              <View style={styles.flex}>
                <Text variant="heading">
                  {i.lavender_unlocked ? 'Lavender unlocked' : `${left} more friend${left === 1 ? '' : 's'} to go`}
                </Text>
                <Text variant="small" color="textSecondary">
                  {i.lavender_unlocked ? 'Thanks for bringing your friends.' : '3 friends join → unlock the Lavender theme'}
                </Text>
              </View>
            </View>
            {i.friends.map((f, n) => (
              <View key={`${f.display_name}${n}`} style={[styles.friend, { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.avatar, { backgroundColor: theme.text }]}>
                  <Text variant="label" color="onInk">
                    {initials(f.display_name)}
                  </Text>
                </View>
                <Text variant="label" style={styles.flex}>
                  {f.display_name ?? 'A friend'}
                </Text>
                <Text variant="label" color="success">
                  Joined
                </Text>
              </View>
            ))}
            <View style={[styles.friend, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.avatar, styles.dashed, { borderColor: theme.line }]} />
              <Text variant="body" color="textSecondary" style={styles.flex}>
                Your next friend
              </Text>
              <Text
                variant="label"
                style={styles.underline}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(i.link)}>
                Preview link
              </Text>
            </View>
          </View>
        </>
      ) : online ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  link: { fontSize: 17 },
  copy: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: 48, marginTop: Spacing.two },
  qr: { padding: 8, borderRadius: Radius.field },
  targets: { flexDirection: 'row', gap: Spacing.two },
  progress: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.two },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.one },
  friend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option },
  avatar: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 2, borderStyle: 'dashed' },
  underline: { textDecorationLine: 'underline' },
  skeleton: { height: 220, borderRadius: Radius.card },
});
