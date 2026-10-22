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

/** Soft-tone message block. Use FRD §4 copy verbatim where it applies. */
export function Banner({ tone = 'error', message }: { tone?: Tone; message: string }) {
  const theme = useTheme();
  const { bg, fg } = TONES[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: theme[bg] }]}
      accessibilityRole={tone === 'info' ? undefined : 'alert'}
      accessibilityLiveRegion="polite">
      <Text variant="small" color={fg}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.field,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
  },
});
