import { create } from 'zustand';

import { Accent, type AccentName } from '@/constants/theme';
import type { Theme } from '@/lib/settings';

const NIGHT_FROM = 21; // 9 PM
const NIGHT_TO = 6; // 6 AM

function isNight(d = new Date()) {
  const h = d.getHours();
  return h >= NIGHT_FROM || h < NIGHT_TO;
}

type Appearance = {
  accent: Theme;
  nightMode: boolean;
  lowData: boolean;
  /** Whether it's night now (re-checked every minute while the app runs). */
  night: boolean;
  set: (fields: Partial<Pick<Appearance, 'accent' | 'nightMode' | 'lowData'>>) => void;
};

/** The student's theme and study modes (FR-HAB-07), mirrored from their settings so every screen
 * can read them without a request. */
export const useAppearance = create<Appearance>((set) => ({
  accent: 'ink',
  nightMode: false,
  lowData: false,
  night: isNight(),
  set: (fields) => set(fields),
}));

setInterval(() => {
  const night = isNight();
  if (useAppearance.getState().night !== night) useAppearance.setState({ night });
}, 60_000);

/** The chosen accent colour, or null for the default Ink theme (DESIGN.md §3.2: it replaces white on
 * ink for rings, the highlighted word, unread dots and badges). */
export function useAccent(): string | null {
  const accent = useAppearance((s) => s.accent);
  return accent === 'ink' ? null : Accent[accent as AccentName];
}

/** Night study mode: dark from 9 PM to 6 AM, whatever the phone setting (FR-HAB-07). */
export function useNightDark() {
  return useAppearance((s) => s.nightMode && s.night);
}
