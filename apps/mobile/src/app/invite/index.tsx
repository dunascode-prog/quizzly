import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Check, ChevronLeft, Gift } from '@/components/icons';
import { initials } from '@/components/profile-header';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { NeedsInternet } from '@/components/ui/needs-internet';
import { Accent, Colors, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useOnline } from '@/lib/network';
import { type Friend, type Invite, LAVENDER_AT, STUDY_DAYS_NEEDED, useInvite } from '@/lib/plans';

const QR = 112;
const RING = 112;
const DISC = 26;
const SHOWN_COUNTED = 2; // counted friends collapse after two (CREDITS_AND_PLANS §3)

// Screen 23 (DESIGN.md §7, FR-INV-01/04/05): your invite link with Copy and a QR code, share
// buttons, and the credits card: friends who really started studying, on the way to the Lavender
// theme (3 credits) and 10% off Student or Premium (5 credits).
export default function InviteScreen() {
  const theme = useTheme();
  const invite = useInvite();
  const [copied, setCopied] = useState(false);
  const online = useOnline();
  const i = invite.data;
  const message = i ? `I study with Quizzly: it turns lecture slides into explanations and exam questions. Join me: ${i.link}` : '';

  // The discount celebration (23c) shows once, the first time this screen sees it (FR-INV-05).
  const celebrated = useRef(false);
  useEffect(() => {
    if (i?.discount.celebrate && !celebrated.current) {
      celebrated.current = true;
      router.push('/invite/unlocked');
    }
  }, [i?.discount.celebrate]);

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

          <CreditsCard invite={i} />
        </>
      ) : online ? (
        <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
      ) : null}
    </Screen>
  );
}

/** The credits card (FR-INV-04): total, the ring with both milestones, what's next, friends. */
function CreditsCard({ invite: i }: { invite: Invite }) {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);
  const goal = i.discount.at;
  const n = i.credited;
  const counted = i.friends.filter((f) => f.state === 'counted');
  const started = i.friends.filter((f) => f.state === 'started');
  const shownCounted = showAll ? counted : counted.slice(0, SHOWN_COUNTED);
  const hidden = counted.length - shownCounted.length;

  const next = i.next_reward;
  const left = next ? Math.max(0, next.at - n) : 0;
  const nextLine = !next
    ? `${i.discount.percent}% off is yours. Thanks for sharing Quizzly.`
    : next.kind === 'lavender'
      ? `${left} more friend${left === 1 ? '' : 's'} to unlock the Lavender theme`
      : `${left} more friend${left === 1 ? '' : 's'} to unlock ${i.discount.percent}% off Student or Premium`;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text variant="caption" color="textSecondary" style={styles.caps}>
            QUIZZLY CREDITS
          </Text>
          <View style={styles.total} accessible accessibilityLabel={`${n} credit${n === 1 ? '' : 's'}`}>
            <Text style={[Type.number, { color: theme.text }]}>{n}</Text>
            <Text variant="title">credit{n === 1 ? '' : 's'}</Text>
          </View>
          <Text variant="small" color="textSecondary">
            One credit for each friend who really started studying
          </Text>
        </View>
        <CreditsRing credited={n} goal={goal} percent={i.discount.percent} />
      </View>

      <Milestone done={i.lavender_unlocked} at={LAVENDER_AT} title="Lavender theme" />
      <Milestone done={i.discount.unlocked} at={goal} title={`${i.discount.percent}% off Student or Premium`} />

      <View style={[styles.nextLine, { backgroundColor: theme.backgroundSelected }]}>
        <Gift size={20} color={theme.text} strokeWidth={2} />
        <Text variant="label" style={styles.flex}>
          {nextLine}
        </Text>
      </View>

      {shownCounted.map((f, k) => (
        <FriendRow key={`c${k}`} friend={f} />
      ))}
      {hidden > 0 ? (
        <TextButton label={`+ ${hidden} more counted · Show all`} compact onPress={() => setShowAll(true)} />
      ) : null}
      {started.map((f, k) => (
        <FriendRow key={`s${k}`} friend={f} />
      ))}
      <View style={[styles.friend, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.avatar, styles.dashed, { borderColor: theme.line }]} />
        <Text variant="body" color="textSecondary" style={styles.flex}>
          Your next friend
        </Text>
        <Text variant="label" style={styles.underline} accessibilityRole="link" onPress={() => void Linking.openURL(i.link)}>
          Preview link
        </Text>
      </View>

      <TextButton label="How credits work" onPress={() => router.push('/invite/how')} />
    </View>
  );
}

/** The ring toward 10% off, with a disc on the track at each milestone (3 Lavender, 5 the discount).
 * Lavender is allowed here (DESIGN.md §3.2: the invite progress ring); text on it is ink. */
function CreditsRing({ credited, goal, percent }: { credited: number; goal: number; percent: number }) {
  const theme = useTheme();
  const r = (RING - 10) / 2;
  const at = (count: number) => {
    const a = (Math.min(count, goal) / goal) * 2 * Math.PI;
    return { left: RING / 2 + r * Math.sin(a) - DISC / 2, top: RING / 2 - r * Math.cos(a) - DISC / 2 };
  };
  const shown = Math.min(credited, goal);
  return (
    <View style={styles.ringBox}>
      <ProgressRing
        size={RING}
        strokeWidth={10}
        value={shown / goal}
        accent={Accent.lavender}
        trackColor="line"
        label={`${shown} of ${goal} credits toward ${percent}% off`}>
        <View style={styles.ringCentre}>
          <Text style={[Type.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {shown}/{goal}
          </Text>
          <Text variant="caption" color="textSecondary" maxFontSizeMultiplier={1.3}>
            {credited >= goal ? 'unlocked' : `to ${percent}% off`}
          </Text>
        </View>
      </ProgressRing>
      {[LAVENDER_AT, goal].map((m) => {
        const done = credited >= m;
        return (
          <View
            key={m}
            style={[
              styles.disc,
              at(m),
              done
                ? { backgroundColor: Accent.lavender, borderColor: theme.backgroundElement }
                : { backgroundColor: theme.backgroundSelected, borderColor: theme.text },
            ]}
            accessible={false}>
            {done ? (
              <Check size={14} color={Colors.light.text} strokeWidth={3} />
            ) : (
              <Text variant="caption" maxFontSizeMultiplier={1.3}>
                {m}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Milestone({ done, at, title }: { done: boolean; at: number; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.milestone} accessible accessibilityLabel={`${title}: ${done ? 'unlocked' : `at ${at} credits`}`}>
      <View style={[styles.badge, done ? { backgroundColor: Accent.lavender } : { borderWidth: 2, borderColor: theme.text }]}>
        {done ? (
          <Check size={18} color={Colors.light.text} strokeWidth={3} />
        ) : (
          <Text variant="label" maxFontSizeMultiplier={1.3}>
            {at}
          </Text>
        )}
      </View>
      <View style={styles.flex}>
        <Text variant="label">{title}</Text>
        <Text variant="small" color="textSecondary">
          {done ? `Unlocked at ${at} credits` : `At ${at} credits`}
        </Text>
      </View>
    </View>
  );
}

function FriendRow({ friend: f }: { friend: Friend }) {
  const theme = useTheme();
  const counted = f.state === 'counted';
  return (
    <View
      style={[styles.friend, { backgroundColor: theme.backgroundSelected }]}
      accessible
      accessibilityLabel={`${f.display_name ?? 'A friend'}: ${counted ? 'counted' : `getting started, studied ${f.study_days} of ${STUDY_DAYS_NEEDED} days`}`}>
      <View style={[styles.avatar, { backgroundColor: theme.text }]}>
        <Text variant="label" color="onInk" maxFontSizeMultiplier={1.3}>
          {initials(f.display_name)}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="label">{f.display_name ?? 'A friend'}</Text>
        {counted ? null : (
          <View style={styles.daysRow}>
            <Text variant="small" color="textSecondary">
              Getting started · Studied {f.study_days} of {STUDY_DAYS_NEEDED} days
            </Text>
            <View style={styles.dots}>
              {Array.from({ length: STUDY_DAYS_NEEDED }, (_, d) => (
                <View key={d} style={[styles.dot, { backgroundColor: d < f.study_days ? theme.text : theme.line }]} />
              ))}
            </View>
          </View>
        )}
      </View>
      {counted ? (
        <View style={styles.countedTag}>
          <Check size={16} color={theme.success} strokeWidth={3} />
          <Text variant="label" color="success">
            Counted
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  link: { fontSize: 17 },
  copy: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: Size.minTouch, marginTop: Spacing.two },
  qr: { padding: 8, borderRadius: Radius.field },
  targets: { flexDirection: 'row', gap: Spacing.two },
  card: { borderRadius: Radius.card, padding: Spacing.gutter, gap: Spacing.twoHalf },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  caps: { letterSpacing: 1 },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  ringBox: { width: RING, height: RING },
  ringCentre: { alignItems: 'center' },
  disc: { position: 'absolute', width: DISC, height: DISC, borderRadius: DISC / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: Size.minTouch },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nextLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, padding: Spacing.three, borderRadius: Radius.option },
  friend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option },
  avatar: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 2, borderStyle: 'dashed' },
  daysRow: { gap: Spacing.one },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 18, height: 4, borderRadius: 2 },
  countedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  underline: { textDecorationLine: 'underline' },
  skeleton: { height: 220, borderRadius: Radius.card },
});
