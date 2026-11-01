import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArrowRight, ArrowUpRight, Check, ChevronLeft } from '@/components/icons';
import {
  type Draft,
  draftFrom,
  missingFrom,
  PRACTICE,
  PhotoStep,
  PracticeStep,
  SchoolStep,
  schoolSummary,
  STYLES,
  updateFrom,
} from '@/components/profile-steps';
import { ActionPill } from '@/components/ui/action-pill';
import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { formatTime } from '@/components/ui/time-pill.shared';
import { ToggleRow } from '@/components/ui/toggle-row';
import { FontFamily, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { useMyAvatar } from '@/lib/avatar';
import { friendlyError } from '@/lib/errors';
import { PRACTICE_REMINDER, type PracticeTime, reminderFor, useMe, useUpdateMe } from '@/lib/profile';
import { useNotificationSettings } from '@/lib/settings';

type Step = 1 | 2 | 3 | 4;
const NAMES: Record<Step, string> = { 1: 'Your photo', 2: 'Your school', 3: 'How you practise', 4: 'All set' };
const MOSTLY: Record<PracticeTime, string> = {
  commute: 'commute',
  lectures: 'between lectures',
  evening: 'evenings',
  night: 'late night',
};
const BEFORE: Record<PracticeTime, string> = {
  commute: 'before your commute',
  lectures: 'before your lecture break',
  evening: 'before your evening study',
  night: 'before your late-night study',
};

// Screen 02 (PROFILE_V2.md, 02a–02h): photo and name, school, how you practise, all set
// (FR-PROF-01/03..07, FR-AUTH-03). Back keeps what was entered; steps 1 and 3 can be skipped.
export default function OnboardingScreen() {
  const theme = useTheme();
  const me = useMe();
  const update = useUpdateMe();
  const quiet = useNotificationSettings().data;
  const photo = useMyAvatar(me.data);
  const [step, setStep] = useState<Step>(1);
  const [draft, set] = useState<Draft>(() => draftFrom(me.data));
  const [searching, setSearching] = useState(!draft.school);
  const [agreed, setAgreed] = useState(me.data?.terms_accepted ?? false);
  const [error, setError] = useState<string | null>(null);

  const go = (to: Step) => {
    setError(null);
    setStep(to);
  };

  const next = () => {
    if (step === 1 && !draft.fullName.trim()) return setError('Enter your full name.');
    if (step === 2) {
      const missing = missingFrom(draft);
      if (missing?.step === 2) return setError(missing.message);
    }
    if (step < 4) return go((step + 1) as Step);
    const missing = missingFrom(draft);
    if (missing) {
      setStep(missing.step);
      return setError(missing.message);
    }
    // The root layout moves to Today once the saved profile says onboarded.
    update.mutate({ ...updateFrom(draft), accept_terms: true }, { onError: (e) => setError(friendlyError(e)) });
  };

  const back = () => (step === 1 ? signOut() : go((step - 1) as Step));

  const reminder = reminderFor(draft.practice, quiet?.quiet_start, quiet?.quiet_end);
  // PRACTICE is in time order, so the first chosen one sets the reminder (unless quiet hours move it).
  const earliest = PRACTICE.map((p) => p.value).find((v) => draft.practice.includes(v));
  const moved = earliest !== undefined && reminder !== PRACTICE_REMINDER[earliest];

  return (
    <Screen
      footer={
        <ActionPill
          label={step === 4 ? 'Start studying' : step === 1 && !photo ? 'Continue without photo' : 'Continue'}
          icon={ArrowRight}
          onPress={next}
          loading={update.isPending}
          disabled={(step === 2 && searching) || (step === 4 && !agreed)}
        />
      }>
      <View style={styles.header}>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel={step === 1 ? 'Sign out and go back' : 'Back'}
          onPress={() => void back()}
        />
        <View style={styles.progress} accessible accessibilityLabel={`Step ${step} of 4, ${NAMES[step]}`}>
          <View style={styles.bars}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.bar, { backgroundColor: i <= step ? theme.text : theme.line }]} />
            ))}
          </View>
          <Text variant="small" color="textSecondary" numberOfLines={2}>
            Step {step} of 4 · {NAMES[step]}
          </Text>
        </View>
        {step === 1 || step === 3 ? (
          <TextButton label="Skip" color="textSecondary" compact onPress={() => go((step + 1) as Step)} />
        ) : null}
      </View>

      {step === 1 ? (
        <>
          <HighlightText highlight="yours">Make it yours</HighlightText>
          <Text variant="body" color="textSecondary">
            Add a photo so your account feels like yours. It&apos;s optional, and only you see it unless you choose
            otherwise.
          </Text>
          <PhotoStep draft={draft} set={set} me={me.data} />
        </>
      ) : step === 2 ? (
        <>
          <HighlightText highlight="study?">Where do you study?</HighlightText>
          <SchoolStep draft={draft} set={set} searching={searching} setSearching={setSearching} />
        </>
      ) : step === 3 ? (
        <>
          <HighlightText highlight="practise?">How do you practise?</HighlightText>
          <PracticeStep draft={draft} set={set} />
        </>
      ) : (
        <>
          <HighlightText highlight="set">You’re all set</HighlightText>
          <HeroCard style={styles.card}>
            <Pressable
              onPress={() => go(1)}
              accessibilityRole="button"
              accessibilityLabel={`${draft.fullName}. ${schoolSummary(draft)}. Edit`}
              style={styles.who}>
              <Avatar name={draft.fullName} uri={photo} size={72} ring="onInk" tone="raised" />
              <View style={styles.flex}>
                <Text variant="title" color="onInk" style={styles.name}>
                  {draft.fullName}
                </Text>
                <Text variant="small" color="mutedOnInk">
                  {schoolSummary(draft)}
                </Text>
              </View>
              <ArrowUpRight size={24} color={theme.onInk} strokeWidth={2} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.track }]} />
            <Ticked bold={`${draft.goal} study days`}>
              {` a week${draft.practice.length ? `, mostly ${PRACTICE.filter((p) => draft.practice.includes(p.value)).map((p) => MOSTLY[p.value]).join(', ')}` : ''}`}
            </Ticked>
            <Ticked bold={STYLES.find((s) => s.value === draft.style)?.label ?? 'Standard'}> explanations</Ticked>
            <Ticked bold="Daily 5 reminder">
              {` at ${formatTime(reminder).toLowerCase()}${earliest && !moved ? `, ${BEFORE[earliest]}` : ''}`}
            </Ticked>
          </HeroCard>

          <ToggleRow
            label="Show my photo to classmates"
            helper="Only in courses you share or join. Off: they see initials."
            value={draft.showPhoto}
            onChange={(showPhoto) => set((d) => ({ ...d, showPhoto }))}
          />

          <Pressable
            onPress={() => setAgreed((a) => !a)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="I agree to the Terms and Privacy Policy"
            style={styles.consent}>
            <View
              style={[
                styles.box,
                { borderColor: theme.text, backgroundColor: agreed ? theme.text : theme.backgroundSelected },
              ]}>
              {agreed ? <Check size={20} color={theme.onInk} strokeWidth={3} /> : null}
            </View>
            <Text variant="body" color="textSecondary" style={styles.flex}>
              I agree to the{' '}
              <Text variant="body" style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal')}>
                Terms
              </Text>{' '}
              and{' '}
              <Text variant="body" style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal')}>
                Privacy Policy
              </Text>
            </Text>
          </Pressable>
        </>
      )}

      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

/** One ticked line on the "All set" card: a bold start and the rest muted. */
function Ticked({ bold, children }: { bold: string; children: string }) {
  const theme = useTheme();
  return (
    <View style={styles.ticked}>
      <View style={[styles.tick, { backgroundColor: theme.backgroundSelected }]}>
        <Check size={16} color={theme.text} strokeWidth={3} />
      </View>
      <Text variant="body" color="mutedOnInk" style={styles.flex}>
        <Text variant="body" color="onInk" style={styles.bold}>
          {bold}
        </Text>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  progress: { flex: 1, gap: Spacing.two },
  bars: { flexDirection: 'row', gap: Spacing.one + 2 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  card: { gap: Spacing.three },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: Size.minTouch },
  name: { fontSize: 24, lineHeight: 28 },
  divider: { height: StyleSheet.hairlineWidth },
  ticked: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tick: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bold: { fontFamily: FontFamily.bold },
  flex: { flex: 1 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, minHeight: Size.minTouch },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
});
