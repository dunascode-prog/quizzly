import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { formatTime, TimePill } from '@/components/ui/time-pill';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { type NotificationSettings, useNotificationSettings, useUpdateNotificationSettings } from '@/lib/settings';

const TYPES: { key: keyof NotificationSettings['types']; label: string; helper: string }[] = [
  { key: 'exam', label: 'Exam countdown', helper: '7, 3 and 1 days before an exam' },
  { key: 'due', label: 'Questions due for review', helper: 'Inside your daily reminder' },
  { key: 'recap', label: 'Weekly recap on Sunday', helper: 'Your week, ready to share at 6 PM' },
  { key: 'mates', label: 'Coursemate joins and challenges', helper: 'When someone joins a course you shared' },
  { key: 'ready', label: 'Notes ready to study', helper: 'When an upload finishes' },
];

function Preview({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.sample, { backgroundColor: theme.inkRaised }]}>
      <Text variant="label" color="onInk">
        {title}
      </Text>
      <Text variant="small" color="mutedOnInk">
        {body}
      </Text>
    </View>
  );
}

// Screen 21 (DESIGN.md §7, FR-HAB-08): one daily reminder, only if you haven't studied, at a time you
// choose; a toggle per kind; quiet hours. Never more than 2 a day, none in quiet hours (C8).
export default function RemindersScreen() {
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [editQuiet, setEditQuiet] = useState(false);
  const s = settings.data;

  return (
    <Screen>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="kindly">Nudge me kindly</HighlightText>
      {settings.isError || update.isError ? <Banner message={friendlyError(settings.error ?? update.error)} /> : null}

      <HeroCard>
        <Text variant="small" color="mutedOnInk">
          Preview on your lock screen
        </Text>
        <Preview title="Time for your Daily 5" body="3 questions ready for review · about 3 minutes" />
        <Preview title="CSC 225 exam in 3 days" body="You're 64% ready. A few questions today will help." />
      </HeroCard>

      {s ? (
        <>
          <ToggleRow
            label="Daily study reminder"
            helper="Only if you haven't studied yet"
            value={s.daily_reminder}
            onChange={(v) => update.mutate({ daily_reminder: v })}>
            {s.daily_reminder ? (
              <TimePill
                value={s.daily_reminder_time}
                onChange={(t) => update.mutate({ daily_reminder_time: t })}
                accessibilityLabel="Reminder time"
              />
            ) : null}
          </ToggleRow>
          <View style={styles.list}>
            {TYPES.map((t) => (
              <ToggleRow
                key={t.key}
                label={t.label}
                helper={t.helper}
                value={s.types[t.key]}
                onChange={(v) => update.mutate({ types: { [t.key]: v } })}
              />
            ))}
          </View>

          <Pressable
            onPress={() => setEditQuiet(!editQuiet)}
            accessibilityRole="button"
            accessibilityHint="Change your quiet hours"
            style={styles.footer}>
            <Text variant="small" color="textSecondary" style={styles.center}>
              Quiet hours {formatTime(s.quiet_start)} – {formatTime(s.quiet_end)} · At most 2 reminders a day
            </Text>
          </Pressable>
          {editQuiet ? (
            <View style={styles.quiet}>
              <View style={styles.quietRow}>
                <Text variant="label">From</Text>
                <TimePill value={s.quiet_start} onChange={(t) => update.mutate({ quiet_start: t })} accessibilityLabel="Quiet hours start" />
              </View>
              <View style={styles.quietRow}>
                <Text variant="label">To</Text>
                <TimePill value={s.quiet_end} onChange={(t) => update.mutate({ quiet_end: t })} accessibilityLabel="Quiet hours end" />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sample: { borderRadius: Radius.option, padding: Spacing.three, gap: 2 },
  list: { gap: Spacing.two },
  footer: { minHeight: 48, justifyContent: 'center' },
  center: { textAlign: 'center' },
  quiet: { flexDirection: 'row', gap: Spacing.four, justifyContent: 'center' },
  quietRow: { alignItems: 'center', gap: Spacing.one },
});
