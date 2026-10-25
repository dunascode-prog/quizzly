import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { create } from 'zustand';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type Course = {
  id: string;
  code: string;
  title: string | null;
  document_count: number;
  created_at: string;
};

export type DocumentStatus = 'awaiting_upload' | 'uploaded' | 'processing' | 'ready' | 'failed';

export type Doc = {
  id: string;
  title: string;
  original_filename: string;
  course_id: string | null;
  status: DocumentStatus;
  progress: number | null;
  failure_reason: string | null;
  failure_message: string | null;
  page_count: number | null;
  topic_count: number;
  low_ocr_page_count: number;
  created_at: string;
};

export type Allowance = { used: number; limit: number; remaining: number };

/** Today's allowances (FR-LIM-01); they reset at midnight, Lagos time. */
export type Usage = {
  uploads: Allowance;
  explanations: Allowance;
  question_sets: Allowance;
  markings: Allowance;
  chat_messages: Allowance;
};

/** Which documents a list shows: a course's, or the ones without a course. */
export type DocScope = { courseId: string } | 'unfiled';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const keys = {
  courses: ['courses'] as const,
  docs: (scope: DocScope) => ['documents', scope] as const,
  usage: ['usage'] as const,
};

function invalidateLibrary() {
  void queryClient.invalidateQueries({ queryKey: keys.courses });
  void queryClient.invalidateQueries({ queryKey: ['documents'] });
  void queryClient.invalidateQueries({ queryKey: keys.usage });
}

function useSignedIn() {
  return Boolean(useAuth((s) => s.session));
}

export function useCourses() {
  return useQuery({
    queryKey: keys.courses,
    queryFn: () => apiFetch<Course[]>('/v1/courses'),
    enabled: useSignedIn(),
  });
}

export function useUsage() {
  return useQuery({ queryKey: keys.usage, queryFn: () => apiFetch<Usage>('/v1/usage'), enabled: useSignedIn() });
}

const BUSY: DocumentStatus[] = ['uploaded', 'processing'];

/** Polls every 3 s while anything in the list is uploading or being processed (DESIGN.md §7, 05). */
export function useDocuments(scope: DocScope) {
  const uploading = useUploads((s) => Object.keys(s.byDoc).length > 0);
  const query = scope === 'unfiled' ? 'unfiled=true' : `course_id=${scope.courseId}`;
  return useQuery({
    queryKey: keys.docs(scope),
    queryFn: () => apiFetch<Doc[]>(`/v1/documents?${query}`),
    enabled: useSignedIn(),
    refetchInterval: (q) => (uploading || q.state.data?.some((d) => BUSY.includes(d.status)) ? 3000 : false),
  });
}

export function useCreateCourse() {
  return useMutation({
    mutationFn: (body: { code: string; title?: string | null }) =>
      apiFetch<Course>('/v1/courses', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidateLibrary,
  });
}

export function useUpdateCourse(courseId: string) {
  return useMutation({
    mutationFn: (body: { code?: string; title?: string | null }) =>
      apiFetch<Course>(`/v1/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: invalidateLibrary,
  });
}

export function useDeleteCourse(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (documents: 'delete' | 'unfile') =>
      apiFetch<void>(`/v1/courses/${courseId}?documents=${documents}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.docs({ courseId }) });
      invalidateLibrary();
    },
  });
}

export function useUpdateDocument(docId: string) {
  return useMutation({
    mutationFn: (body: { title?: string; course_id?: string | null }) =>
      apiFetch<Doc>(`/v1/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: invalidateLibrary,
  });
}

export function useDeleteDocument(docId: string) {
  return useMutation({
    mutationFn: () => apiFetch<void>(`/v1/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      useUploads.getState().forget(docId);
      invalidateLibrary();
    },
  });
}

// --- Uploads -------------------------------------------------------------------------------------
// Files go straight to Storage through signed URLs (FR-DOC-03): one for a PDF/PPTX, one per photo
// for a photo set. The picked files stay known while the app is open, so a dropped upload can be
// retried without picking them again (FR-DOC-04).

type LocalFile = { uri: string; mimeType?: string; size: number };
type UploadState = { files: LocalFile[]; progress: number; failed: boolean };

type UploadsStore = {
  byDoc: Record<string, UploadState>;
  set: (docId: string, patch: Partial<UploadState>) => void;
  forget: (docId: string) => void;
};

export const useUploads = create<UploadsStore>((setState) => ({
  byDoc: {},
  set: (docId, patch) =>
    setState((s) => ({
      byDoc: { ...s.byDoc, [docId]: { ...(s.byDoc[docId] ?? { files: [], progress: 0, failed: false }), ...patch } },
    })),
  forget: (docId) =>
    setState((s) => {
      const { [docId]: _, ...rest } = s.byDoc;
      return { byDoc: rest };
    }),
}));

type UploadOut = { document: Doc; upload_urls: string[] };

async function sendFiles(docId: string, urls: string[]) {
  const store = useUploads.getState();
  const entry = store.byDoc[docId];
  if (!entry || entry.files.length !== urls.length) return;
  store.set(docId, { failed: false, progress: 0 });
  const total = entry.files.reduce((n, f) => n + f.size, 0) || 1;
  let done = 0;
  try {
    for (const [i, file] of entry.files.entries()) {
      const result = await new File(file.uri).upload(urls[i], {
        httpMethod: 'PUT',
        mimeType: file.mimeType,
        onProgress: ({ bytesSent }) => useUploads.getState().set(docId, { progress: (done + bytesSent) / total }),
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`upload HTTP ${result.status}`);
      done += file.size;
    }
    await apiFetch<Doc>(`/v1/documents/${docId}/uploaded`, { method: 'POST' });
    useUploads.getState().forget(docId);
  } catch (e) {
    if (__DEV__) console.warn('[upload]', e);
    useUploads.getState().set(docId, { failed: true });
  } finally {
    invalidateLibrary();
  }
}

async function register(body: object, files: LocalFile[]): Promise<Doc> {
  const reg = await apiFetch<UploadOut>('/v1/documents', { method: 'POST', body: JSON.stringify(body) });
  useUploads.getState().set(reg.document.id, { files, progress: 0, failed: false });
  invalidateLibrary();
  void sendFiles(reg.document.id, reg.upload_urls);
  return reg.document;
}

/** A PDF or PPTX: registers the upload, then sends it in the background. */
export function startUpload(
  file: { uri: string; name: string; size: number; mimeType?: string },
  courseId: string | null,
): Promise<Doc> {
  return register({ filename: file.name, size_bytes: file.size, course_id: courseId }, [file]);
}

/** 1–30 photos as one document, pages in this order (FR-DOC-01). */
export function startPhotoUpload(
  photos: { uri: string; size: number }[],
  title: string,
  courseId: string | null,
): Promise<Doc> {
  const files = photos.map((p) => ({ uri: p.uri, size: p.size, mimeType: 'image/jpeg' }));
  return register(
    {
      filename: title,
      size_bytes: files.reduce((n, f) => n + f.size, 0),
      course_id: courseId,
      image_count: files.length,
    },
    files,
  );
}

export async function retryUpload(docId: string) {
  useUploads.getState().set(docId, { failed: false, progress: 0 });
  try {
    const { upload_urls } = await apiFetch<UploadOut>(`/v1/documents/${docId}/upload-url`, { method: 'POST' });
    await sendFiles(docId, upload_urls);
  } catch (e) {
    if (__DEV__) console.warn('[upload retry]', e);
    useUploads.getState().set(docId, { failed: true });
  }
}
