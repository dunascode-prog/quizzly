import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ArrowRight, Bell as BellIcon, X } from '@/components/icons';
import { ProfileHeader } from '@/components/profile-header';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { CountdownCard } from '@/components/ui/countdown-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { PlanRow } from '@/components/ui/plan-row';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { WeekStrip } from '@/components/ui/week-strip';
import { Accent, BottomTabInset, Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { getDaily5, type PlanItem, useHome, useJoinByCode } from '@/lib/home';
import { useMe } from '@/lib/profile';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Monday, 26 October" */
function longDate(d = new Date()) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

type Row = { title: string; meta: string; hint?: string; onPress: () => void };

/** The bell (screen 14 → 22) with the unread count on a Lagoon badge (DESIGN.md §3.2). */
function Bell({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View>
      <IconButton
        icon={BellIcon}
        accessibilityLabel={count ? `Notifications, ${count} new` : 'Notifications'}
        onPress={() => router.push('/notifications')}
      />
      {count ? (
        <View style={[styles.badge, { backgroundColor: Accent.lagoon, borderColor: theme.background }]} pointerEvents="none">
          <Text variant="caption" style={styles.badgeText}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Enter the code from a coursemate's share link (screen 20 comes with D4). */
function JoinSheet({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const join = useJoinByCode();
  const [code, setCode] = useState('');
  const submit = () =>
    code.trim().length >= 4 &&
    join.mutate(code.trim(), {
      onSuccess: (r) => {
        onClose();
        router.push({ pathname: '/course/[id]', params: { id: r.course_id } });
      },
    });
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={onClose} accessible={false} />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.sheetHeader}>
          <HighlightText highlight="course">Join a course</HighlightText>
          <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
        </View>
        <Text variant="body" color="textSecondary">
          Got a link from a coursemate? Type the code at the end of it, like 7KQ2M9XD.
        </Text>
        <TextField
          label="Share code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={20}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {join.isError ? <Banner message={friendlyError(join.error)} /> : null}
        <ActionPill label="Join course" icon={ArrowRight} onPress={submit} loading={join.isPending} disabled={code.trim().length < 4} />
      </View>
    </Modal>
  );
}

// Screen 14 (DESIGN.md §7, FR-HOME-01..05): the date and greeting, the nearest exam with
// readiness, this week's study days, and today's plan, all from GET /home.
export default function TodayScreen() {
  const theme = useTheme();
  const me = useMe();
  const home = useHome();
  const [joining, setJoining] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstName = me.data?.full_name?.split(' ')[0];
  const data = home.data;

  // Back from a quiz or a reading: show the new progress.
  const { refetch } = home;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const openDaily5 = async () => {
    setError(null);
    setOpening(true);
    try {
      const d5 = await getDaily5();
      router.push({
        pathname: '/quiz/[id]/play',
        params: { id: d5.quiz_id, mode: 'practice', ...(d5.attempt_id && !d5.done ? { attempt: d5.attempt_id } : {}) },
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setOpening(false);
    }
  };

  const row = (item: PlanItem): Row => {
    switch (item.kind) {
      case 'daily5':
        return {
          title: 'Daily 5',
          meta: `${item.due ? `${item.due} question${item.due === 1 ? '' : 's'} due` : '5 questions'} · ${item.minutes} min`,
          hint: 'Starts five quick questions',
          onPress: () => !opening && void openDaily5(),
        };
      case 'weak_topic':
        return {
          title: 'Fix a weak topic',
          meta: `${item.title} · 5 questions`,
          hint: 'Sets up a short quiz on this topic',
          onPress: () => router.push({ pathname: '/quiz/new', params: { documentId: item.document_id, topicId: item.topic_id } }),
        };
      case 'learn':
        return {
          title: 'Learn something new',
          meta: `${item.title} · ${item.minutes} min read`,
          hint: 'Opens the explanation',
          onPress: () =>
            router.push({ pathname: '/document/[id]/topic/[topicId]', params: { id: item.document_id, topicId: item.topic_id } }),
        };
      case 'practise_any':
        return { title: 'Practise any course', meta: 'Pick a course and take a short quiz', onPress: () => router.navigate('/library') };
      case 'upload':
        return { title: 'Upload your first notes', meta: 'Slides, a PDF or photos of your notes', onPress: () => router.push('/upload') };
      case 'join_shared':
        return {
          title: 'Join a shared course',
          meta: 'Study a coursemate’s notes without uploading',
          onPress: () => setJoining(true),
        };
    }
  };

  // About how long today's plan takes: a weak-topic quiz is about 5 minutes (FR-HOME-05).
  const minutes = (data?.plan ?? []).reduce(
    (m, p) => m + (('minutes' in p && p.minutes) || (p.kind === 'weak_topic' ? 5 : 0)),
    0,
  );

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <ProfileHeader me={me.data} title={longDate()} />
        </View>
        <Bell count={data?.unread_notifications ?? 0} />
      </View>
      <HighlightText highlight={firstName ?? 'there'}>{`${greeting()}, ${firstName ?? 'there'}`}</HighlightText>

      {home.isError ? <Banner message={friendlyError(home.error)} /> : null}
      {error ? <Banner message={error} /> : null}

      {home.isPending ? (
        <>
          <View style={[styles.skeleton, styles.tall, { backgroundColor: theme.backgroundElement }]} />
          <View style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
        </>
      ) : data ? (
        <>
          <CountdownCard
            countdown={data.countdown}
            onSetDate={() =>
              data.countdown
                ? router.push({ pathname: '/course/[id]/edit', params: { id: data.countdown.course_id } })
                : router.push('/course/new')
            }
          />
          <WeekStrip days={data.week.days} today={data.today} studyDays={data.week.study_days} goal={data.week.goal} />

          <View style={styles.section}>
            <View style={styles.planHeader}>
              <Text variant="title" accessibilityRole="header">
                Today&apos;s plan
              </Text>
              {minutes ? (
                <Text variant="small" color="textSecondary">
                  About {Math.max(5, Math.round(minutes / 5) * 5)} min
                </Text>
              ) : null}
            </View>
            {data.plan.map((item, i) => {
              const r = row(item);
              return <PlanRow key={item.kind} ink={i === 0} title={r.title} meta={r.meta} onPress={r.onPress} accessibilityHint={r.hint} />;
            })}
          </View>
        </>
      ) : null}

      {joining ? <JoinSheet onClose={() => setJoining(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // Text on an accent is always ink (DESIGN.md §3.2).
  badgeText: { color: Colors.light.text, fontSize: 11, lineHeight: 14 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  skeleton: { height: 120, borderRadius: Radius.card },
  tall: { height: 180 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: Spacing.gutter,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
