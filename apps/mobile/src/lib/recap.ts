import { useQuery } from '@tanstack/react-query';

import type { AccentName } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fromIsoDay, toIsoDay } from '@/lib/format';

export type Recap = {
  week_start: string;
  week_end: string;
  /** Sunday 6 PM local (FR-HAB-06) */
  ready: boolean;
  questions_answered: number;
  study_days: number;
  goal: number;
  weeks_in_a_row: number;
  topics_mastered: number;
  readiness: { course_id: string; code: string; accent: AccentName; value: number; change: number | null } | null;
  name: string | null;
  institution: string | null;
  level: string | null;
  show_identity: boolean;
  invite_code: string | null;
};

/** The Monday of the week `day` falls in, as "YYYY-MM-DD". */
export function mondayOf(day: Date = new Date()) {
  const d = new Date(day);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toIsoDay(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "19–25 Oct", or "27 Oct – 2 Nov" across a month. */
export function weekLabel(start: string, end: string) {
  const a = fromIsoDay(start);
  const b = fromIsoDay(end);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/** The week starting on Monday `week` (FR-HAB-06). */
export function useRecap(week: string | undefined) {
  return useQuery({
    queryKey: ['recap', week],
    queryFn: () => apiFetch<Recap>(`/v1/recap/${week}`),
    enabled: Boolean(useAuth((s) => s.session)) && Boolean(week),
  });
}
