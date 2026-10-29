import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type Topic = {
  id: string;
  ordinal: number;
  title: string;
  summary: string | null;
  page_start: number | null;
  page_end: number | null;
  /** The name before this student renamed or merged it (FR-TOP-03). */
  original_title?: string | null;
  /** The original topics this one covers: more than one after a merge. */
  parts?: string[];
  /** The original names of `parts`. */
  part_titles?: string[];
};

export type Outline = {
  document: {
    id: string;
    title: string;
    course_id?: string | null;
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
  /** Waiting because every AI provider is busy or today's budget is spent (FR-LIM-03). */
  busy?: boolean;
};

type Page = { page_number: number; page_count: number | null; text: string };

function useSignedIn() {
  return Boolean(useAuth((s) => s.session));
}

export function useOutline(documentId: string) {
  return useQuery({
    queryKey: ['outline', documentId],
    queryFn: () => apiFetch<Outline>(`/v1/documents/${documentId}/outline`),
    enabled: useSignedIn() && Boolean(documentId),
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

/**
 * The page as uploaded (FR-DOC-10): a signed URL that lasts 5 minutes, so it's refetched after 4
 * and never persisted. `url` is null for slides, which show their text instead.
 */
export function usePageImage(documentId: string, page: number) {
  const lowData = useAppearance((s) => s.lowData);
  return useQuery({
    queryKey: ['page-image', documentId, page],
    queryFn: () => apiFetch<{ url: string | null }>(`/v1/documents/${documentId}/pages/${page}/image`),
    enabled: useSignedIn() && page > 0 && !lowData,
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
    retry: 1,
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
  return useRate('explanation');
}

/** Thumbs up/down on an explanation or a chat answer (FR-MOD-03). */
export function useRate(targetType: 'explanation' | 'chat_message') {
  return useMutation({
    mutationFn: (body: { target_id: string; rating: 1 | -1 }) =>
      apiFetch<void>('/v1/feedback', { method: 'POST', body: JSON.stringify({ target_type: targetType, ...body }) }),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (body: {
      target_type: 'explanation' | 'question' | 'chat_message';
      target_id: string;
      reason: 'wrong' | 'unclear' | 'inappropriate';
      note?: string;
    }) => apiFetch<void>('/v1/reports', { method: 'POST', body: JSON.stringify(body) }),
  });
}

// --- The student's own topic names and merges (FR-TOP-03, screen 27) ------------------------------

function changeOutline(documentId: string, path: string, init: RequestInit) {
  return apiFetch<Outline>(`/v1/documents/${documentId}/topics/${path}`, init).then((outline) => {
    queryClient.setQueryData(['outline', documentId], outline);
    void queryClient.invalidateQueries({ queryKey: ['home'] }); // plan rows use the names
    return outline;
  });
}

/** A new name for this student only; null goes back to the original. */
export function renameTopic(documentId: string, topicId: string, title: string | null) {
  return changeOutline(documentId, `${topicId}/name`, { method: 'PUT', body: JSON.stringify({ title }) });
}

/** This topic and the next one become one, for this student only. */
export function mergeTopic(documentId: string, topicId: string, title: string | null) {
  return changeOutline(documentId, `${topicId}/merge`, { method: 'POST', body: JSON.stringify({ title }) });
}

export function splitTopic(documentId: string, topicId: string) {
  return changeOutline(documentId, `${topicId}/split`, { method: 'POST' });
}

/** "p. 6–11", or "p. 6" for one page. */
export function pageRange(t: Pick<Topic, 'page_start' | 'page_end'>) {
  if (!t.page_start) return '';
  return t.page_end && t.page_end !== t.page_start ? `p. ${t.page_start}–${t.page_end}` : `p. ${t.page_start}`;
}
