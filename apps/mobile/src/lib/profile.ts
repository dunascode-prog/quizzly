import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export type Level = '100L' | '200L' | '300L' | '400L' | '500L' | '600L' | '700L' | 'other';

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
  explanation_style: 'standard' | 'simple' | 'exam';
  terms_accepted: boolean;
  onboarded: boolean;
};

export type ProfileUpdate = Partial<
  Pick<Me, 'full_name' | 'institution_other' | 'department' | 'level'> & {
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

export function useInstitutionSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['institutions', q.toLowerCase()],
    queryFn: () => apiFetch<Institution[]>(`/v1/institutions?q=${encodeURIComponent(q)}&limit=20`),
    placeholderData: keepPreviousData,
    staleTime: 24 * 60 * 60_000,
  });
}

/** "University of Lagos (UNILAG)" */
export function institutionLabel(i: Institution) {
  return i.short_name ? `${i.name} (${i.short_name})` : i.name;
}
