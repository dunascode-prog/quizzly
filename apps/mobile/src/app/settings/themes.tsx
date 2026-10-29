import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ThemeRow } from '@/components/ui/theme-row';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { useHome } from '@/lib/home';
import { type Theme, useSettings, useUpdateSettings } from '@/lib/settings';

const THEMES: { key: Theme; name: string; unlocked: string; locked: string }[] = [
  { key: 'ink', name: 'Ink', unlocked: 'Default', locked: 'Default' },
  { key: 'lagoon', name: 'Lagoon', unlocked: 'Unlocked: first mastered topic', locked: 'Master your first topic' },
  { key: 'ankara', name: 'Ankara', unlocked: 'Unlocked: 10 topics mastered', locked: 'Master 10 topics' },
  { key: 'palm', name: 'Palm', unlocked: 'Unlocked: weekly goal 4 weeks running', locked: 'Meet your weekly goal 4 weeks running' },
  { key: 'lavender', name: 'Lavender', unlocked: 'Unlocked: 3 friends joined', locked: '3 friends join Quizzly' },
];

// Screen 18 (DESIGN.md §7, FR-HAB-07): the accent for rings, highlights and badges (unlocked by the
// progress engine), night study mode and low-data mode.
export default function ThemesScreen() {
  const theme = useTheme();
  const settings = useSettings();
  const update = useUpdateSettings();
  const readiness = useHome().data?.countdown?.readiness ?? 0;
  const s = settings.data;
  const chosen = THEMES.find((t) => t.key === s?.accent) ?? THEMES[0];
  const swatch = (key: Theme) => (key === 'ink' ? theme.text : Accent[key]);

  return (
    <Screen>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="yours">Make it yours</HighlightText>
      {settings.isError || update.isError ? <Banner message={friendlyError(settings.error ?? update.error)} /> : null}

      <HeroCard style={styles.preview}>
        <ProgressRing size={96} strokeWidth={8} value={readiness} label={`${Math.round(readiness * 100)}%`} />
        <View style={styles.flex}>
          <Text variant="heading" color="onInk">
            {chosen.name} {chosen.key === 'ink' ? 'theme' : 'accent'}
          </Text>
          <Text variant="small" color="mutedOnInk">
            Rings, highlights and badges use this colour.
          </Text>
        </View>
      </HeroCard>

      <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {THEMES.map((t) => {
          const unlocked = s?.unlocked_themes.includes(t.key) ?? t.key === 'ink';
          return (
            <ThemeRow
              key={t.key}
              name={t.name}
              rule={unlocked ? t.unlocked : t.locked}
              color={swatch(t.key)}
              selected={s?.accent === t.key}
              locked={!unlocked}
              onPress={() => update.mutate({ accent: t.key })}
            />
          );
        })}
      </View>

      <View style={styles.list}>
        <ToggleRow
          label="Night study mode"
          helper="Dark from 9 PM, calmer animations"
          value={s?.night_mode ?? false}
          onChange={(v) => update.mutate({ night_mode: v })}
        />
        <ToggleRow
          label="Low-data mode"
          helper="No page images in citations: you see the page text instead"
          value={s?.low_data_mode ?? false}
          onChange={(v) => update.mutate({ low_data_mode: v })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, gap: Spacing.one },
  list: { gap: Spacing.two },
});
