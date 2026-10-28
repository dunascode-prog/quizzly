import { useMutation, useQuery } from '@tanstack/react-query';

import type { AccentName } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type Countdown = {
  course_id: string;
  code: string;
  title: string | null;
  accent: AccentName;
  /** null: no exam date, the card asks for one (FR-HOME-02) */
  exam_date: string | null;
  days_left: number | null;
  readiness: number;
  /** null when there was no value 7 days ago */
  change_this_week: number | null;
};

export type WeekDay = { day: string; studied: boolean; questions: number };

export type PlanItem =
  | { kind: 'daily5'; due: number; minutes: number }
  | { kind: 'weak_topic'; topic_id: string; title: string; document_id: string; mastery: number }
  | { kind: 'learn'; topic_id: string; title: string; document_id: string; minutes: number }
  | { kind: 'practise_any' }
  | { kind: 'upload' }
  | { kind: 'join_shared' };

export type Achievement = { id: string; kind: string; ref: Record<string, string> };

export type Home = {
  today: string;
  countdown: Countdown | null;
  week: { days: WeekDay[]; study_days: number; goal: number; weeks_in_a_row: number };
  plan: PlanItem[];
  unread_notifications: number;
  achievements: Achievement[];
};

export type Daily5 = { quiz_id: string; day: string; size: number; attempt_id: string | null; done: boolean };

export const homeKey = ['home'] as const;

/** Everything Today shows, in one small request (FR-HOME-01..05, NFR-02). */
export function useHome() {
  return useQuery({
    queryKey: homeKey,
    queryFn: () => apiFetch<Home>('/v1/home'),
    enabled: Boolean(useAuth((s) => s.session)),
    staleTime: 30_000,
  });
}

/** Progress changes after a quiz; the progress job takes a moment, so look again shortly after. */
export function refreshHomeSoon() {
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: homeKey });
    void queryClient.invalidateQueries({ queryKey: ['study-days'] });
  };
  refresh();
  setTimeout(refresh, 4000);
}

export type StudyDays = { today: string; days: WeekDay[]; study_days: number };

/** The study-days grid, last 5 weeks (FR-HAB-04). */
export function useStudyDays(weeks = 5) {
  return useQuery({
    queryKey: ['study-days', weeks],
    queryFn: () => apiFetch<StudyDays>(`/v1/study-days?weeks=${weeks}`),
    enabled: Boolean(useAuth((s) => s.session)),
    staleTime: 30_000,
  });
}

/** Today's Daily 5 quiz (made on first request, the same all day; FR-HAB-01). */
export function getDaily5() {
  return apiFetch<Daily5>('/v1/daily5');
}

export function useJoinByCode() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ member_id: string | null; course_id: string }>('/v1/shares/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      void queryClient.invalidateQueries({ queryKey: homeKey });
    },
  });
}
