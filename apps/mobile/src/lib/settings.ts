import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type Theme = 'ink' | 'lagoon' | 'ankara' | 'palm' | 'lavender';
export type Settings = {
  weekly_goal_days: number;
  accent: Theme;
  night_mode: boolean;
  low_data_mode: boolean;
  share_permission: 'coursemates' | 'code' | 'nobody';
  show_identity_on_links: boolean;
  timezone: string;
  unlocked_themes: Theme[];
};

const key = ['settings'] as const;

/** Study settings (FR-HAB-03, FR-HAB-07, FR-SHARE-09). */
export function useSettings() {
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<Settings>('/v1/me/settings'),
    enabled: Boolean(useAuth((s) => s.session)),
  });
}

export function useUpdateSettings() {
  return useMutation({
    mutationFn: (fields: Partial<Omit<Settings, 'unlocked_themes'>>) =>
      apiFetch<Settings>('/v1/me/settings', { method: 'PATCH', body: JSON.stringify(fields) }),
    onMutate: async (fields) => {
      // Toggles feel instant; the server's answer replaces this either way.
      const before = queryClient.getQueryData<Settings>(key);
      if (before) queryClient.setQueryData(key, { ...before, ...fields });
      return { before };
    },
    onError: (_e, _f, ctx) => ctx?.before && queryClient.setQueryData(key, ctx.before),
    onSuccess: (s) => {
      queryClient.setQueryData(key, s);
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
