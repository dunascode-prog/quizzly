import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { deviceStore } from '@/lib/device-store';

const WEEK = 1000 * 60 * 60 * 24 * 7;

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime ≥ the persisted maxAge, or saved content would be dropped before it could be restored.
    // Not on the web server, where a week-long timer per query would keep rendering processes alive.
    queries: { staleTime: 60_000, retry: 1, gcTime: typeof window === 'undefined' ? Infinity : WEEK },
  },
});

/** What a student has opened is kept on the device for offline use (FR-OFF-01). */
const KEPT = new Set(['me', 'courses', 'documents', 'outline', 'explanation', 'page', 'quiz', 'attempt', 'practice', 'chat']);

export const persistOptions = {
  persister: createAsyncStoragePersister({ storage: deviceStore, key: 'quizzly.cache', throttleTime: 1000 }),
  maxAge: WEEK,
  // Bump when a cached response's shape changes, so old copies are thrown away.
  buster: '1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) =>
      query.state.status === 'success' && KEPT.has(String(query.queryKey[0])),
  },
};
