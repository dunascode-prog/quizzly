import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type Topic = {
  id: string;
  ordinal: number;
  title: string;
  summary: string | null;
  page_start: number | null;
  page_end: number | null;
};

export type Outline = {
  document: {
    id: string;
    title: string;
    course_code: string | null;
    page_count: number | null;
    topic_count: number;
    low_ocr_pages: number[];
  };
  topics: Topic[];
};

export type Style = 'standard' | 'simple' | 'exam';

export type Explanation = {
  id: string;
  style: Style;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  content_md: string | null;
  citations: number[];
};

type Page = { page_number: number; page_count: number | null; text: string };

function useSignedIn() {
  return Boolean(useAuth((s) => s.session));
}

export function useOutline(documentId: string) {
  return useQuery({
    queryKey: ['outline', documentId],
    queryFn: () => apiFetch<Outline>(`/v1/documents/${documentId}/outline`),
    enabled: useSignedIn(),
    staleTime: 10 * 60_000,
  });
}

export function usePage(documentId: string, page: number) {
  return useQuery({
    queryKey: ['page', documentId, page],
    queryFn: () => apiFetch<Page>(`/v1/documents/${documentId}/pages/${page}`),
    enabled: useSignedIn() && page > 0,
    staleTime: Infinity,
  });
}

const WRITING: Explanation['status'][] = ['pending', 'generating'];

/**
 * Asks for the explanation (cached ones return at once; FR-EXPL-04), then polls while the
 * worker writes it. Switching style asks for that style (FR-EXPL-02).
 */
export function useExplanation(documentId: string, topicId: string, style: Style) {
  const path = `/v1/documents/${documentId}/topics/${topicId}/explanation`;
  return useQuery({
    queryKey: ['explanation', documentId, topicId, style],
    queryFn: async ({ queryKey }) => {
      const known = queryClient.getQueryData<Explanation>(queryKey);
      // First fetch (or a retry after failure) asks for it; later fetches only poll.
      if (!known || known.status === 'failed') {
        const asked = await apiFetch<Explanation>(path, { method: 'POST', body: JSON.stringify({ style }) });
        void queryClient.invalidateQueries({ queryKey: ['usage'] }); // may have used one (FR-LIM-01)
        return asked;
      }
      return apiFetch<Explanation>(`${path}?style=${style}`);
    },
    enabled: useSignedIn(),
    staleTime: Infinity,
    retry: false,
    refetchInterval: (q) => (q.state.data && WRITING.includes(q.state.data.status) ? 1500 : false),
  });
}

export function useRateExplanation() {
  return useMutation({
    mutationFn: (body: { target_id: string; rating: 1 | -1 }) =>
      apiFetch<void>('/v1/feedback', { method: 'POST', body: JSON.stringify({ target_type: 'explanation', ...body }) }),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (body: { target_id: string; reason: 'wrong' | 'unclear' | 'inappropriate'; note?: string }) =>
      apiFetch<void>('/v1/reports', { method: 'POST', body: JSON.stringify({ target_type: 'explanation', ...body }) }),
  });
}
