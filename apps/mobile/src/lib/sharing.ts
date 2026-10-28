import { useMutation, useQuery } from '@tanstack/react-query';

import type { AccentName } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { homeKey } from '@/lib/home';
import { queryClient } from '@/lib/query-client';

export type Share = { code: string; link: string; member_count: number; sent?: number | null };
export type Member = { member_id: string; display_name: string | null; status: 'pending' | 'active'; joined_at: string | null };
export type Coursemate = { user_id: string; display_name: string | null };
export type Preview = {
  member_id: string | null;
  status: string | null;
  course_id: string;
  code: string;
  accent: AccentName;
  title: string | null;
  owner_name: string | null;
  institution: string | null;
  level: string | null;
  notes: number;
  topics: number;
  questions: number;
  /** null below 3, so a small group isn't exposed (FR-SHARE-04) */
  member_count: number | null;
  own_course?: boolean;
};
export type Blocked = { user_id: string; display_name: string | null; created_at: string };

const signedIn = () => Boolean(useAuth.getState().session);

function refreshLibrary() {
  void queryClient.invalidateQueries({ queryKey: ['courses'] });
  void queryClient.invalidateQueries({ queryKey: ['documents'] });
  void queryClient.invalidateQueries({ queryKey: homeKey });
}

/** The course's active share, or null when it isn't shared yet. */
export function useShare(courseId: string) {
  return useQuery({
    queryKey: ['share', courseId],
    queryFn: () =>
      apiFetch<Share>(`/v1/courses/${courseId}/share`).catch((e) => {
        if (e?.status === 404) return null;
        throw e;
      }),
    enabled: signedIn(),
  });
}

export function useCoursemates() {
  return useQuery({ queryKey: ['coursemates'], queryFn: () => apiFetch<Coursemate[]>('/v1/coursemates'), enabled: signedIn() });
}

export function useMembers(courseId: string) {
  return useQuery({
    queryKey: ['members', courseId],
    queryFn: () => apiFetch<Member[]>(`/v1/courses/${courseId}/members`),
    enabled: signedIn(),
  });
}

function shareChanged(courseId: string) {
  void queryClient.invalidateQueries({ queryKey: ['share', courseId] });
  void queryClient.invalidateQueries({ queryKey: ['members', courseId] });
  void queryClient.invalidateQueries({ queryKey: ['courses'] });
}

/** Makes the link if needed, and sends to coursemates and Quizzly codes (FR-SHARE-01). */
export function useShareCourse(courseId: string) {
  return useMutation({
    mutationFn: (body: { user_ids?: string[]; codes?: string[] }) =>
      apiFetch<Share>(`/v1/courses/${courseId}/share`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (share) => {
      queryClient.setQueryData(['share', courseId], share);
      shareChanged(courseId);
    },
  });
}

export function useRegenerateLink(courseId: string) {
  return useMutation({
    mutationFn: () => apiFetch<Share>(`/v1/courses/${courseId}/share/regenerate`, { method: 'POST' }),
    onSuccess: (share) => {
      queryClient.setQueryData(['share', courseId], share);
      shareChanged(courseId);
    },
  });
}

export function useStopSharing(courseId: string) {
  return useMutation({
    mutationFn: () => apiFetch<void>(`/v1/courses/${courseId}/share/stop`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(['share', courseId], null);
      shareChanged(courseId);
    },
  });
}

export function useRemoveMember(courseId: string) {
  return useMutation({
    mutationFn: (memberId: string) => apiFetch<void>(`/v1/courses/${courseId}/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => shareChanged(courseId),
  });
}

/** Screen 20, from a course sent in Quizzly (`memberId`) or a share link (`code`). */
export function usePreview(source: { memberId?: string; code?: string }) {
  return useQuery({
    queryKey: ['preview', source.memberId ?? source.code],
    queryFn: () =>
      apiFetch<Preview>(source.memberId ? `/v1/shares/${source.memberId}` : `/v1/shares/code/${encodeURIComponent(source.code ?? '')}`),
    enabled: signedIn() && Boolean(source.memberId || source.code),
    retry: false,
  });
}

/** Add to library / Not now / Leave (FR-SHARE-03, 07). */
export function useRespond() {
  return useMutation({
    mutationFn: ({ memberId, action }: { memberId: string; action: 'accept' | 'decline' | 'leave' }) =>
      apiFetch<{ member_id: string; course_id: string }>(`/v1/shares/${memberId}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      refreshLibrary();
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useJoinLink() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ member_id: string | null; course_id: string }>('/v1/shares/join', { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: refreshLibrary,
  });
}

export function useReportCourse(courseId: string) {
  return useMutation({
    mutationFn: (reason: 'copyright' | 'wrong' | 'spam' | 'other') =>
      apiFetch<void>(`/v1/courses/${courseId}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),
  });
}

export function useBlocked() {
  return useQuery({ queryKey: ['blocks'], queryFn: () => apiFetch<Blocked[]>('/v1/blocks'), enabled: signedIn() });
}

export function useUnblock() {
  return useMutation({
    mutationFn: (userId: string) => apiFetch<void>(`/v1/blocks/${userId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  });
}
