import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Tone = 'error' | 'warning' | 'info';

const TONES: Record<Tone, { bg: ThemeColor; fg: ThemeColor }> = {
  error: { bg: 'dangerSoft', fg: 'danger' },
  warning: { bg: 'warningSoft', fg: 'warning' },
  info: { bg: 'backgroundSelected', fg: 'text' },
};

// The server's limit, padlock and allowance messages (FRD §4) name a plan. Running out isn't an
// error: they show calmly with a way to the plans (FR-PLAN-04).
const PLAN_MESSAGE = /(Student|Premium) gives you|on Student and Premium|AI allowance/;

/** Soft-tone message block. Use FRD §4 copy verbatim where it applies. */
export function Banner({ tone = 'error', message }: { tone?: Tone; message: string }) {
  const theme = useTheme();
  const aboutPlans = PLAN_MESSAGE.test(message);
  const { bg, fg } = TONES[aboutPlans ? 'info' : tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: theme[bg] }]}
      accessibilityRole={tone === 'info' || aboutPlans ? undefined : 'alert'}
      accessibilityLiveRegion="polite">
      <Text variant="small" color={fg}>
        {message}
      </Text>
      {aboutPlans ? (
        <Text
          variant="label"
          accessibilityRole="link"
          accessibilityHint="Opens the plans"
          onPress={() => router.push('/plans')}
          style={styles.link}>
          See plans
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.field,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    gap: Spacing.one,
  },
  link: { textDecorationLine: 'underline', paddingVertical: Spacing.one },
});
