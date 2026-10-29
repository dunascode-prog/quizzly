import { router } from 'expo-router';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Bus, Camera, Check, Coffee, Image, type LucideIcon, Moon, Sun } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Pill } from '@/components/ui/pill';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { SelectField, TextField } from '@/components/ui/text-field';
import { FontFamily, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickAvatar, saveAvatar, useMyAvatar } from '@/lib/avatar';
import { friendlyError } from '@/lib/errors';
import { PermissionDenied } from '@/lib/photos';
import {
  type ExplanationStyle,
  type Institution,
  institutionLabel,
  type Level,
  type Me,
  type PracticeTime,
  type ProfileUpdate,
  useInstitutionSearch,
} from '@/lib/profile';

/*
 * The parts of profile setup (PROFILE_V2.md, 02a–02g): onboarding shows them one step at a time,
 * edit profile stacks steps 1–3 in one form.
 */

export type InstitutionChoice = { kind: 'listed'; institution: Institution } | { kind: 'other'; name: string };

export type Draft = {
  fullName: string;
  school: InstitutionChoice | null;
  department: string;
  level: Level | null;
  practice: PracticeTime[];
  goal: number;
  style: ExplanationStyle;
  showPhoto: boolean;
};

type StepProps = { draft: Draft; set: Dispatch<SetStateAction<Draft>> };

export function draftFrom(me: Me | undefined): Draft {
  return {
    fullName: me?.full_name ?? '',
    school: me?.institution
      ? { kind: 'listed', institution: me.institution }
      : me?.institution_other
        ? { kind: 'other', name: me.institution_other }
        : null,
    department: me?.department ?? '',
    level: me?.level ?? null,
    practice: me?.practice_times ?? [],
    goal: me?.weekly_goal_days ?? 4,
    style: me?.explanation_style ?? 'standard',
    showPhoto: me?.avatar_visible ?? false,
  };
}

/** What the draft saves (FR-PROF-01/03/05/06/07). */
export function updateFrom(d: Draft): ProfileUpdate {
  return {
    full_name: d.fullName.trim(),
    department: d.department.trim() || null,
    level: d.level,
    practice_times: d.practice,
    weekly_goal_days: d.goal,
    explanation_style: d.style,
    avatar_visible: d.showPhoto,
    ...(d.school?.kind === 'listed'
      ? { institution_id: d.school.institution.id }
      : d.school
        ? { institution_other: d.school.name }
        : {}),
  };
}

/** The first thing still needed before the profile can be saved, as a message. */
export function missingFrom(d: Draft): { step: 1 | 2; message: string } | null {
  if (!d.fullName.trim()) return { step: 1, message: 'Enter your full name.' };
  if (!d.school) return { step: 2, message: 'Choose your school.' };
  if (!d.level) return { step: 2, message: 'Choose your level.' };
  return null;
}

/** "Tolu A.": how other students see the name (FR-SHARE). */
export function displayName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** "UNILAG · 200L · Computer Science" */
export function schoolSummary(d: Draft) {
  const school = d.school?.kind === 'listed' ? (d.school.institution.short_name ?? d.school.institution.name) : d.school?.name;
  return [school, d.level === 'other' ? null : d.level, d.department.trim()].filter(Boolean).join(' · ');
}

/** Camera or gallery → the crop screen (02c), with the permission message when it's refused. */
export function usePhotoPicker() {
  const [error, setError] = useState<string | null>(null);
  const pick = async (source: 'camera' | 'gallery', replace = false) => {
    setError(null);
    try {
      const photo = await pickAvatar(source);
      if (!photo) return;
      const to = {
        pathname: '/profile/crop' as const,
        params: { uri: photo.uri, width: String(photo.width), height: String(photo.height) },
      };
      if (replace) router.replace(to);
      else router.push(to);
    } catch (e) {
      setError(
        e instanceof PermissionDenied
          ? `Allow Quizzly to use your ${e.message} in your phone's settings, then try again.`
          : friendlyError(e),
      );
    }
  };
  return { pick, error };
}

function IconPill({ icon: Icon, label, ink, onPress }: { icon: LucideIcon; label: string; ink?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconPill,
        { backgroundColor: ink ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Icon size={20} color={ink ? theme.onInk : theme.text} strokeWidth={2} />
      <Text variant="label" color={ink ? 'onInk' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

// --- Step 1: your photo (02a–02d) -----------------------------------------------------------------

export function PhotoStep({ draft, set, me }: StepProps & { me: Me | undefined }) {
  const uri = useMyAvatar(me);
  const photos = usePhotoPicker();
  const shownAs = displayName(draft.fullName);
  return (
    <>
      <View style={styles.photo}>
        <Avatar
          name={draft.fullName}
          uri={uri}
          size={156}
          dashed
          badge
          onPress={() => router.push('/profile/photo')}
          accessibilityLabel={uri ? 'Profile photo. Change it' : 'Add profile photo'}
        />
        {uri ? (
          <View style={styles.row}>
            <TextButton label="Change photo" compact onPress={() => router.push('/profile/photo')} />
            <TextButton label="Remove" color="danger" compact onPress={() => void saveAvatar(null)} />
          </View>
        ) : (
          <View style={styles.row}>
            <IconPill icon={Camera} label="Take a photo" ink onPress={() => void photos.pick('camera')} />
            <IconPill icon={Image} label="Gallery" onPress={() => void photos.pick('gallery')} />
          </View>
        )}
      </View>
      {photos.error ? <Banner message={photos.error} /> : null}
      <View style={styles.fields}>
        <TextField
          label="Full name"
          value={draft.fullName}
          onChangeText={(fullName) => set((d) => ({ ...d, fullName }))}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={120}
        />
        {shownAs ? (
          <View style={styles.shownAs}>
            <Avatar name={draft.fullName} uri={draft.showPhoto ? uri : null} size={28} />
            <Text variant="small" color="textSecondary" style={styles.flex}>
              Classmates see you as{' '}
              <Text variant="small" style={styles.bold}>
                {shownAs}
              </Text>
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

// --- Step 2: your school (02e–02f) ----------------------------------------------------------------

const MAIN_LEVELS: Level[] = ['100L', '200L', '300L', '400L', '500L'];
const MORE_LEVELS: { value: Level; label: string }[] = [
  { value: '600L', label: '600L' },
  { value: '700L', label: '700L' },
  { value: 'other', label: 'Not listed' },
];

/** `searching` is the open school list; onboarding keeps Continue off while it's open (02e). */
export function SchoolStep({
  draft,
  set,
  searching,
  setSearching,
}: StepProps & { searching: boolean; setSearching: (open: boolean) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState('');
  const [showMore, setShowMore] = useState(draft.level !== null && !MAIN_LEVELS.includes(draft.level));
  const results = useInstitutionSearch(query);
  const picked = draft.school?.kind === 'listed' ? draft.school.institution.id : null;

  const choose = (school: InstitutionChoice) => {
    set((d) => ({ ...d, school }));
    setSearching(false);
    setTyping(false);
    setQuery('');
  };

  return (
    <>
      <View style={styles.fields}>
        {!searching ? (
          <SelectField
            label="Institution"
            value={
              draft.school
                ? draft.school.kind === 'listed'
                  ? institutionLabel(draft.school.institution)
                  : draft.school.name
                : undefined
            }
            placeholder="Search for your school"
            onPress={() => setSearching(true)}
            accessibilityHint="Search for your school"
          />
        ) : typing ? (
          <>
            <TextField
              label="School name"
              value={other}
              onChangeText={setOther}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={160}
            />
            <View style={styles.row}>
              <TextButton label="Back to the list" compact onPress={() => setTyping(false)} />
              <Pill label="Use this school" onPress={() => other.trim().length >= 3 && choose({ kind: 'other', name: other.trim() })} />
            </View>
          </>
        ) : (
          <>
            <TextField
              label="Institution"
              value={query}
              onChangeText={setQuery}
              placeholder="UNILAG or University of Lagos"
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              onClear={query ? () => setQuery('') : undefined}
            />
            {results.isError ? <Banner message={friendlyError(results.error)} /> : null}
            <View style={[styles.results, { backgroundColor: theme.backgroundSelected }]}>
              {(results.data ?? []).slice(0, 6).map((i) => {
                const selected = i.id === picked;
                return (
                  <Pressable
                    key={i.id}
                    onPress={() => choose({ kind: 'listed', institution: i })}
                    accessibilityRole="button"
                    accessibilityLabel={institutionLabel(i)}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.result,
                      { backgroundColor: selected ? theme.background : 'transparent', opacity: pressed ? 0.8 : 1 },
                    ]}>
                    <View style={styles.flex}>
                      <Text variant="label">{i.name}</Text>
                      <Text variant="small" color="textSecondary">
                        {[i.short_name, i.state].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {selected ? (
                      <View style={[styles.tick, { backgroundColor: theme.text }]}>
                        <Check size={16} color={theme.onInk} strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
              {results.data?.length === 0 && !results.isFetching ? (
                <Text variant="small" color="textSecondary" style={styles.resultPad}>
                  No school matches &quot;{query.trim()}&quot;.
                </Text>
              ) : null}
              <Text
                variant="label"
                accessibilityRole="button"
                onPress={() => {
                  setOther(query.trim());
                  setTyping(true);
                }}
                style={[styles.link, styles.resultPad]}>
                My school isn&apos;t listed
              </Text>
            </View>
            {draft.school ? <TextButton label="Keep my school" compact onPress={() => setSearching(false)} /> : null}
          </>
        )}
        {!searching ? (
          <TextField
            label="Department"
            value={draft.department}
            onChangeText={(department) => set((d) => ({ ...d, department }))}
            placeholder="e.g. Computer Science"
            autoCapitalize="words"
            maxLength={120}
          />
        ) : null}
      </View>

      {!searching ? (
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Level">
          <Text variant="label">Level</Text>
          <View style={styles.pills}>
            {MAIN_LEVELS.map((l) => (
              <Pill
                key={l}
                label={l}
                role="radio"
                selected={draft.level === l}
                onPress={() => {
                  set((d) => ({ ...d, level: l }));
                  setShowMore(false);
                }}
              />
            ))}
            <Pill label="Other" role="radio" selected={showMore} onPress={() => setShowMore(true)} />
          </View>
          {showMore ? (
            <View style={styles.pills}>
              {MORE_LEVELS.map((l) => (
                <Pill
                  key={l.value}
                  label={l.label}
                  role="radio"
                  selected={draft.level === l.value}
                  onPress={() => set((d) => ({ ...d, level: l.value }))}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

// --- Step 3: how you practise (02g) ---------------------------------------------------------------

export const PRACTICE: { value: PracticeTime; icon: LucideIcon; title: string; sub: string }[] = [
  { value: 'commute', icon: Bus, title: 'On my commute', sub: 'Bus, keke, traffic' },
  { value: 'lectures', icon: Coffee, title: 'Between lectures', sub: 'Short gaps' },
  { value: 'evening', icon: Sun, title: 'Evenings', sub: 'After classes' },
  { value: 'night', icon: Moon, title: 'Late night', sub: 'After 10 pm' },
];

export const GOALS = [
  { days: 3, label: 'Light' },
  { days: 4, label: 'Steady' },
  { days: 6, label: 'Serious' },
];

export const STYLES: { value: ExplanationStyle; label: string; about: string }[] = [
  { value: 'standard', label: 'Standard', about: 'Clear explanations with the key terms your lecturer uses.' },
  { value: 'simple', label: 'Simple', about: "Plain words, step by step, like you're new to the topic." },
  { value: 'exam', label: 'Exam', about: 'Definitions, likely exam questions and how to structure your answers.' },
];

function Choice({
  selected,
  onPress,
  role,
  label,
  children,
  style,
}: {
  selected: boolean;
  onPress: () => void;
  role: 'checkbox' | 'radio';
  label: string;
  children: ReactNode;
  style?: object;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: selected ? theme.text : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

export function PracticeStep({ draft, set }: StepProps) {
  const theme = useTheme();
  const toggle = (t: PracticeTime) =>
    set((d) => ({ ...d, practice: d.practice.includes(t) ? d.practice.filter((p) => p !== t) : [...d.practice, t] }));
  return (
    <>
      <View style={styles.group}>
        <Text variant="label">When do you usually practise?</Text>
        <View style={styles.grid}>
          {PRACTICE.map(({ value, icon: Icon, title, sub }) => {
            const on = draft.practice.includes(value);
            return (
              <Choice key={value} selected={on} onPress={() => toggle(value)} role="checkbox" label={`${title}. ${sub}`} style={styles.half}>
                <View style={[styles.choiceIcon, { backgroundColor: on ? theme.backgroundSelected : theme.backgroundElement }]}>
                  <Icon size={20} color={theme.text} strokeWidth={2} />
                </View>
                <View style={styles.flex}>
                  <Text variant="label" color={on ? 'onInk' : 'text'}>
                    {title}
                  </Text>
                  <Text variant="small" color={on ? 'mutedOnInk' : 'textSecondary'}>
                    {sub}
                  </Text>
                </View>
              </Choice>
            );
          })}
        </View>
        <Text variant="small" color="textSecondary">
          Pick any. We&apos;ll send your Daily 5 reminder just before these times.
        </Text>
      </View>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Weekly goal">
        <Text variant="label">Weekly goal</Text>
        <View style={styles.three}>
          {GOALS.map((g) => {
            const on = draft.goal === g.days;
            return (
              <Choice
                key={g.days}
                selected={on}
                onPress={() => set((d) => ({ ...d, goal: g.days }))}
                role="radio"
                label={`${g.days} days a week, ${g.label}`}
                style={styles.third}>
                <View style={styles.center}>
                  <Text variant="label" color={on ? 'onInk' : 'text'}>
                    {g.days} days
                  </Text>
                  <Text variant="small" color={on ? 'mutedOnInk' : 'textSecondary'}>
                    {g.label}
                  </Text>
                </View>
              </Choice>
            );
          })}
        </View>
      </View>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Explanations">
        <Text variant="label">Explanations</Text>
        <View style={styles.pills}>
          {STYLES.map((s) => (
            <Pill key={s.value} label={s.label} role="radio" selected={draft.style === s.value} onPress={() => set((d) => ({ ...d, style: s.value }))} />
          ))}
        </View>
        <Text variant="small" color="textSecondary">
          {STYLES.find((s) => s.value === draft.style)?.about}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: 'center', gap: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: Spacing.twoHalf },
  iconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: Size.minTouch,
    paddingHorizontal: Spacing.gutter,
    borderRadius: Radius.full,
  },
  fields: { gap: Spacing.twoHalf },
  shownAs: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf, paddingHorizontal: Spacing.one },
  bold: { fontFamily: FontFamily.bold },
  flex: { flex: 1 },
  results: { borderRadius: Radius.card, padding: Spacing.two, gap: Spacing.half },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: Size.field,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    borderRadius: Radius.option,
  },
  resultPad: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.twoHalf },
  link: { textDecorationLine: 'underline' },
  tick: { width: 28, height: 28, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  group: { gap: Spacing.twoHalf },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.twoHalf },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.twoHalf },
  three: { flexDirection: 'row', gap: Spacing.twoHalf },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    minHeight: Size.field,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.twoHalf + 2,
    borderRadius: Radius.option,
  },
  half: { flexBasis: '45%', flexGrow: 1 },
  third: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.two },
  center: { alignItems: 'center', flex: 1 },
  choiceIcon: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});
