import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArrowRight, Check, ChevronLeft } from '@/components/icons';
import { type InstitutionChoice, InstitutionPicker } from '@/components/institution-picker';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { SelectField, TextField } from '@/components/ui/text-field';
import { Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { institutionLabel, type Level, useMe, useUpdateMe } from '@/lib/profile';

const MAIN_LEVELS: Level[] = ['100L', '200L', '300L', '400L', '500L'];
const MORE_LEVELS: { value: Level; label: string }[] = [
  { value: '600L', label: '600L' },
  { value: '700L', label: '700L' },
  { value: 'other', label: 'Not listed' },
];

function initialChoice(me: ReturnType<typeof useMe>['data']): InstitutionChoice | null {
  if (me?.institution) return { kind: 'listed', institution: me.institution };
  if (me?.institution_other) return { kind: 'other', name: me.institution_other };
  return null;
}

/**
 * Name, school, department and level (FR-PROF-01). `onboarding` is screen 02 and also asks for
 * consent (FR-AUTH-03); `edit` is reached from Account and goes back when saved (FR-PROF-02).
 */
export function ProfileForm({ mode }: { mode: 'onboarding' | 'edit' }) {
  const editing = mode === 'edit';
  const theme = useTheme();
  const me = useMe();
  const update = useUpdateMe();

  const [fullName, setFullName] = useState(me.data?.full_name ?? '');
  const [school, setSchool] = useState<InstitutionChoice | null>(() => initialChoice(me.data));
  const [department, setDepartment] = useState(me.data?.department ?? '');
  const [level, setLevel] = useState<Level | null>(me.data?.level ?? null);
  const [showMore, setShowMore] = useState(level !== null && !MAIN_LEVELS.includes(level));
  const [agreed, setAgreed] = useState(me.data?.terms_accepted ?? false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = !fullName.trim()
    ? 'Enter your full name.'
    : !school
      ? 'Choose your school.'
      : !level
        ? 'Choose your level.'
        : !agreed && !editing
          ? 'Agree to the Terms and Privacy Policy to continue.'
          : null;

  const submit = () => {
    if (missing) {
      setError(missing);
      return;
    }
    setError(null);
    // The root layout moves to the tabs once the saved profile says onboarded.
    update.mutate(
      {
        full_name: fullName.trim(),
        department: department.trim() || null,
        level,
        ...(editing ? {} : { accept_terms: true }),
        ...(school?.kind === 'listed' ? { institution_id: school.institution.id } : { institution_other: school!.name }),
      },
      { onSuccess: () => editing && router.back(), onError: (e) => setError(friendlyError(e)) },
    );
  };

  return (
    <Screen
      footer={
        <ActionPill
          label={editing ? 'Save changes' : 'Start studying'}
          icon={editing ? Check : ArrowRight}
          onPress={submit}
          loading={update.isPending}
        />
      }>
      {editing ? (
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      ) : (
        <IconButton icon={ChevronLeft} accessibilityLabel="Sign out and go back" onPress={signOut} />
      )}

      {editing ? (
        <HighlightText highlight="profile">Edit your profile</HighlightText>
      ) : (
        <HighlightText highlight="study?">Where do you study?</HighlightText>
      )}

      <View style={styles.fields}>
        <TextField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={120}
        />
        <SelectField
          label="Institution"
          value={school ? (school.kind === 'listed' ? institutionLabel(school.institution) : school.name) : undefined}
          placeholder="Search for your school"
          onPress={() => setPicking(true)}
          accessibilityHint="Opens a searchable list of schools"
        />
        <TextField
          label="Department"
          value={department}
          onChangeText={setDepartment}
          placeholder="e.g. Computer Science"
          autoCapitalize="words"
          maxLength={120}
        />
      </View>

      <View style={styles.levels} accessibilityRole="radiogroup" accessibilityLabel="Level">
        <Text variant="label">Level</Text>
        <View style={styles.pills}>
          {MAIN_LEVELS.map((l) => (
            <Pill
              key={l}
              label={l}
              role="radio"
              selected={level === l}
              onPress={() => {
                setLevel(l);
                setShowMore(false);
              }}
            />
          ))}
          <Pill label="Other" role="radio" selected={showMore} onPress={() => setShowMore(true)} />
        </View>
        {showMore ? (
          <View style={styles.pills}>
            {MORE_LEVELS.map((l) => (
              <Pill key={l.value} label={l.label} role="radio" selected={level === l.value} onPress={() => setLevel(l.value)} />
            ))}
          </View>
        ) : null}
      </View>

      {editing ? null : (
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
          <Text variant="small" color="textSecondary" style={styles.consentText}>
            I agree to the Terms and Privacy Policy
          </Text>
        </Pressable>
      )}

      {error ? <Banner message={error} /> : null}

      <InstitutionPicker visible={picking} onClose={() => setPicking(false)} onPick={setSchool} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: Spacing.twoHalf },
  levels: { gap: Spacing.twoHalf },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.twoHalf },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    minHeight: Size.minTouch,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentText: { flex: 1 },
});
