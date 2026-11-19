import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useNightDark } from '@/lib/appearance';

const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * useSyncExternalStore returns the server snapshot (false) during hydration and true afterwards.
 * Night study mode turns it dark from 9 PM (FR-HAB-07).
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();
  const night = useNightDark();
  if (!hasHydrated) return 'light';
  return night ? 'dark' : colorScheme;
}
