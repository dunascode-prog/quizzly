import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { type Settings, useSettings, useUpdateSettings } from '@/lib/settings';
import { useBlocked, useUnblock } from '@/lib/sharing';

const WHO: { key: Settings['share_permission']; label: string; hint: string }[] = [
  { key: 'coursemates', label: 'Coursemates only', hint: 'People who already share a course with you' },
  { key: 'code', label: 'Anyone with my code', hint: 'Coursemates, and anyone you give your Quizzly code' },
  { key: 'nobody', label: 'No one', hint: 'You can still join courses from a link' },
];

// Privacy and blocking (DESIGN.md §7, FR-SHARE-09, FR-INV-02): who can send you courses, your
// name on invite links and recaps, and the people you've blocked.
export default function PrivacyScreen() {
  const theme = useTheme();
  const settings = useSettings();
  const update = useUpdateSettings();
  const blocked = useBlocked();
  const unblock = useUnblock();
  const s = settings.data;
  const error = settings.error ?? update.error ?? blocked.error ?? unblock.error;

  return (
    <Screen>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="blocking">Privacy and blocking</HighlightText>
      {error ? <Banner message={friendlyError(error)} /> : null}

      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Who can send me courses
        </Text>
        <View accessibilityRole="radiogroup" style={styles.options}>
          {WHO.map((w) => (
            <View key={w.key} style={styles.option}>
              <Pill
                label={w.label}
                role="radio"
                selected={s?.share_permission === w.key}
                onPress={() => update.mutate({ share_permission: w.key })}
              />
              <Text variant="small" color="textSecondary">
                {w.hint}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="small" color="textSecondary">
          If someone you don&apos;t allow sends you a course, they see it as sent, and nothing reaches you.
        </Text>
      </View>

      <ToggleRow
        label="Show my name on invite links and recaps"
        helper="Your first name, school and level. Turn off to stay anonymous."
        value={s?.show_identity_on_links ?? true}
        onChange={(v) => update.mutate({ show_identity_on_links: v })}
      />

      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Blocked people
        </Text>
        {blocked.data?.length ? (
          blocked.data.map((b) => (
            <View key={b.user_id} style={[styles.toggleRow, { backgroundColor: theme.backgroundSelected }]}>
              <Text variant="label" style={styles.flex}>
                {b.display_name ?? 'Someone'}
              </Text>
              <Pill label="Unblock" onPress={() => unblock.mutate(b.user_id)} />
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary">
            Nobody. Long-press a notification to block someone.
          </Text>
        )}
      </View>

      <TextButton label="Privacy Policy and Terms" color="textSecondary" onPress={() => router.push('/legal')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  options: { gap: Spacing.three },
  option: { gap: 4, alignItems: 'flex-start' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option },
  flex: { flex: 1 },
});
