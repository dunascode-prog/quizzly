import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { type Achievement, homeKey } from '@/lib/home';
import { queryClient } from '@/lib/query-client';

export type Celebration = {
  id: string;
  kind: 'topic_mastered' | 'personal_best' | 'readiness_up' | 'weekly_goal' | 'theme_unlocked';
  ref: Record<string, string>;
  /** 0–1, the big ring, and the number inside it ("80%", "4/4") */
  ring: number;
  ring_label: string;
  subtitle: string | null;
  /** "Since last Monday" bars; null hides that card */
  before: number | null;
  now: number | null;
  readiness: { code: string; before: number | null; now: number } | null;
};

/** The biggest moment goes first; a theme unlocked with it shows as a row on the same screen. */
const ORDER = ['topic_mastered', 'personal_best', 'readiness_up', 'weekly_goal', 'theme_unlocked'];

export function pickCelebration(list: Achievement[]) {
  const sorted = [...list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const main = sorted[0];
  if (!main) return null;
  const theme = list.find((a) => a.kind === 'theme_unlocked')?.ref.theme;
  return { main, theme: theme ?? null };
}

export function useCelebration(id: string | undefined) {
  return useQuery({
    queryKey: ['achievement', id],
    queryFn: () => apiFetch<Celebration>(`/v1/achievements/${id}`),
    enabled: Boolean(useAuth((s) => s.session)) && Boolean(id),
  });
}

/** Seen ones aren't celebrated again (FR-HAB-05). */
export async function markSeen(ids: string[]) {
  if (!ids.length) return;
  await apiFetch('/v1/achievements/seen', { method: 'POST', body: JSON.stringify({ ids }) });
  void queryClient.invalidateQueries({ queryKey: homeKey });
}

let celebrated = false; // at most one celebration per app session (FR-HAB-05)
const SETTLE_MS = 700; // let the root stack finish its sign-in redirects first

/** On Today: opens screen 16 for the newest unseen achievements, once per session. Everything
 * waiting is marked seen together, so nothing piles up into a string of pop-ups later. */
export function useCelebrateOnce(achievements: Achievement[] | undefined) {
  useFocusEffect(
    useCallback(() => {
      if (celebrated || !achievements?.length) return;
      const pick = pickCelebration(achievements);
      if (!pick) return;
      const timer = setTimeout(() => {
        celebrated = true;
        void markSeen(achievements.map((a) => a.id)).catch(() => {});
        router.push({
          pathname: '/celebrate/[achievementId]',
          params: pick.theme ? { achievementId: pick.main.id, theme: pick.theme } : { achievementId: pick.main.id },
        });
      }, SETTLE_MS);
      return () => clearTimeout(timer);
    }, [achievements]),
  );
}
