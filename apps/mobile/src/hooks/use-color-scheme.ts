import { useColorScheme as useRNColorScheme } from 'react-native';

import { useNightDark } from '@/lib/appearance';

/** The phone's light/dark setting, or dark during night study mode (FR-HAB-07). */
export function useColorScheme() {
  const scheme = useRNColorScheme();
  return useNightDark() ? 'dark' : scheme;
}
