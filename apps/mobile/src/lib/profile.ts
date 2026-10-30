import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { signOut, useAuth } from '@/lib/auth';

// Nigerian levels, years elsewhere (FR-PROF-08), postgraduate, other.
export type Level =
  | '100L' | '200L' | '300L' | '400L' | '500L' | '600L' | '700L'
  | 'Y1' | 'Y2' | 'Y3' | 'Y4' | 'Y5' | 'Y6' | 'PG'
  | 'other';

export type Institution = {
  id: string;
  name: string;
  short_name: string | null;
  type?: string | null;
  state?: string | null;
};

export type Me = {
  id: string;
  email: string | null;
  full_name: string | null;
  institution: Institution | null;
  institution_other: string | null;
  department: string | null;
  level: Level | null;
  explanation_style: ExplanationStyle;
  terms_accepted: boolean;
  onboarded: boolean;
  /** Signed, valid for 7 days; null without a photo (FR-PROF-04). */
  avatar_url: string | null;
  /** "Show my photo to classmates" (FR-PROF-05). */
  avatar_visible: boolean;
  practice_times: PracticeTime[];
  weekly_goal_days: number;
  /** Set by payments only (FR-LIM-04); free students get the cheaper AI models. */
  plan: 'free' | 'student' | 'premium';
  /** ISO 3166-1 alpha-2, e.g. "NG" (FR-PROF-08). */
  country: string;
  timezone: string;
};

export type ExplanationStyle = 'standard' | 'simple' | 'exam';
export type PracticeTime = 'commute' | 'lectures' | 'evening' | 'night';

export type ProfileUpdate = Partial<
  Pick<
    Me,
    | 'full_name'
    | 'institution_other'
    | 'department'
    | 'level'
    | 'explanation_style'
    | 'avatar_visible'
    | 'practice_times'
    | 'weekly_goal_days'
    | 'country'
    | 'timezone'
  > & {
    institution_id: string | null;
    accept_terms: boolean;
  }
>;

export function useMe() {
  const userId = useAuth((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['me', userId],
    queryFn: () => apiFetch<Me>('/v1/me'),
    enabled: Boolean(userId),
  });
}

export function useUpdateMe() {
  const client = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  return useMutation({
    mutationFn: (body: ProfileUpdate) => apiFetch<Me>('/v1/me', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (me) => client.setQueryData(['me', userId], me),
  });
}

/** Deletes the account and everything only this student owns, then signs out (FR-AUTH-05). */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/v1/me', { method: 'DELETE' }),
    onSuccess: () => signOut(),
  });
}

/** Schools in the student's country (FR-PROF-08). */
export function useInstitutionSearch(query: string, country = 'NG') {
  const q = query.trim();
  return useQuery({
    queryKey: ['institutions', country, q.toLowerCase()],
    queryFn: () =>
      apiFetch<Institution[]>(`/v1/institutions?q=${encodeURIComponent(q)}&limit=20&country=${country}`),
    placeholderData: keepPreviousData,
    staleTime: 24 * 60 * 60_000,
  });
}

/** "University of Lagos (UNILAG)" */
export function institutionLabel(i: Institution) {
  return i.short_name ? `${i.name} (${i.short_name})` : i.name;
}

/** Daily 5 reminder before each practice time (FR-PROF-06); the API sets the same. */
export const PRACTICE_REMINDER: Record<PracticeTime, string> = {
  commute: '06:45',
  lectures: '11:50',
  evening: '17:45',
  night: '21:45',
};
const DEFAULT_REMINDER = '19:30';

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The earliest chosen time, moved to the end of quiet hours if it falls inside them. */
export function reminderFor(times: PracticeTime[], quietStart = '23:00', quietEnd = '07:00') {
  const at = times.length ? times.map((t) => PRACTICE_REMINDER[t]).sort()[0] : DEFAULT_REMINDER;
  const [m, start, end] = [minutes(at), minutes(quietStart), minutes(quietEnd)];
  const quiet = start <= end ? m >= start && m < end : m >= start || m < end;
  return quiet ? quietEnd.slice(0, 5) : at;
}
