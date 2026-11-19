import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';

import { apiFetch } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { useAuth } from '@/lib/auth';
import { deviceStore } from '@/lib/device-store';
import { queryClient } from '@/lib/query-client';
import type { Quiz } from '@/lib/quiz';
import type { Explanation, Outline, Style } from '@/lib/study';

/*
 * "Save for offline" (FR-OFF-03, screen 28). The manifest lists what exists for a course; each item
 * is fetched into the same query cache the screens read, which the persister keeps on the phone
 * (FR-OFF-01). Nothing is generated: only explanations already written are fetched.
 */

export type Manifest = {
  course_id: string;
  documents: { id: string; title: string; bytes: number }[];
  explanations: { document_id: string; topic_id: string; style: Style; bytes: number }[];
  quizzes: { id: string; document_id: string; questions: number; bytes: number }[];
  bytes: number;
};

type Part = { done: number; total: number };
export type Job = {
  status: 'downloading' | 'waiting_wifi' | 'failed';
  bytesDone: number;
  bytesTotal: number;
  outlines: Part;
  explanations: Part;
  quizzes: Part;
};
export type Saved = {
  savedAt: string;
  bytes: number;
  documentIds: string[];
  /** Keys of what's on the phone, so an update only fetches what's new. */
  items: string[];
  wifiOnly: boolean;
};

type State = {
  saved: Record<string, Saved>;
  jobs: Record<string, Job>;
};

const KEY = 'offline.saved';
export const useOffline = create<State>(() => ({ saved: {}, jobs: {} }));
let owner: string | null = null; // whose downloads these are

void deviceStore.getItem(KEY).then((raw) => {
  try {
    const stored = raw ? (JSON.parse(raw) as { owner: string | null; saved: Record<string, Saved> }) : null;
    if (stored?.saved) {
      owner = stored.owner;
      useOffline.setState({ saved: stored.saved });
    }
  } catch {
    // a broken copy: start again
  }
});

function persist() {
  void deviceStore.setItem(KEY, JSON.stringify({ owner, saved: useOffline.getState().saved }));
}

// Signing out clears the cached content (FR-AUTH-04), so the record of what's saved goes too; a
// different account on this phone starts with nothing saved.
useAuth.subscribe((s) => {
  const uid = s.session?.user.id ?? null;
  if ((s.ready && !uid) || (uid && owner && uid !== owner)) {
    useOffline.setState({ saved: {}, jobs: {} });
    owner = uid;
    persist();
  } else if (uid && !owner) {
    owner = uid;
  }
});

function setJob(courseId: string, job: Job | null) {
  useOffline.setState((s) => {
    const jobs = { ...s.jobs };
    if (job) jobs[courseId] = job;
    else delete jobs[courseId];
    return { jobs };
  });
}

export function useManifest(courseId: string) {
  return useQuery({
    queryKey: ['offline-manifest', courseId],
    queryFn: () => apiFetch<Manifest>(`/v1/courses/${courseId}/offline`),
    enabled: Boolean(useAuth((s) => s.session)) && Boolean(courseId),
    staleTime: 0,
  });
}

const cancelled = new Set<string>();

async function onWifi() {
  return (await NetInfo.fetch()).type === 'wifi';
}

async function waitForWifi(courseId: string, job: Job) {
  while (!(await onWifi())) {
    if (cancelled.has(courseId)) return;
    setJob(courseId, { ...job, status: 'waiting_wifi' });
    await new Promise((r) => setTimeout(r, 5000));
  }
}

type Item = { key: string; bytes: number; part: 'outlines' | 'explanations' | 'quizzes'; fetch: () => Promise<void> };

function items(m: Manifest): Item[] {
  return [
    ...m.documents.map((d) => ({
      key: `o:${d.id}`,
      bytes: d.bytes,
      part: 'outlines' as const,
      fetch: async () => {
        queryClient.setQueryData(['outline', d.id], await apiFetch<Outline>(`/v1/documents/${d.id}/outline`));
      },
    })),
    ...m.explanations.map((e) => ({
      key: `e:${e.document_id}:${e.topic_id}:${e.style}`,
      bytes: e.bytes,
      part: 'explanations' as const,
      fetch: async () => {
        // GET only: it never asks for a new explanation, so it can't use the daily limit.
        const path = `/v1/documents/${e.document_id}/topics/${e.topic_id}/explanation?style=${e.style}`;
        queryClient.setQueryData(['explanation', e.document_id, e.topic_id, e.style], await apiFetch<Explanation>(path));
      },
    })),
    ...m.quizzes.map((q) => ({
      key: `q:${q.id}`,
      bytes: q.bytes,
      part: 'quizzes' as const,
      fetch: async () => {
        queryClient.setQueryData(['quiz', q.id], await apiFetch<Quiz>(`/v1/quizzes/${q.id}`));
      },
    })),
  ];
}

/** Downloads the course. With `onlyNew`, items already on the phone are skipped (auto-update). */
export async function download(courseId: string, manifest: Manifest, { wifiOnly = false, onlyNew = false } = {}) {
  if (useOffline.getState().jobs[courseId]?.status === 'downloading') return;
  cancelled.delete(courseId);
  const have = new Set(onlyNew ? (useOffline.getState().saved[courseId]?.items ?? []) : []);
  const all = items(manifest);
  const todo = all.filter((i) => !have.has(i.key));
  const count = (part: Item['part']) => all.filter((i) => i.part === part).length;
  const job: Job = {
    status: 'downloading',
    bytesDone: 0,
    bytesTotal: todo.reduce((n, i) => n + i.bytes, 0),
    outlines: { done: count('outlines') - todo.filter((i) => i.part === 'outlines').length, total: count('outlines') },
    explanations: { done: count('explanations') - todo.filter((i) => i.part === 'explanations').length, total: count('explanations') },
    quizzes: { done: count('quizzes') - todo.filter((i) => i.part === 'quizzes').length, total: count('quizzes') },
  };
  setJob(courseId, job);
  const fetched = new Set(have);
  try {
    for (const item of todo) {
      if (wifiOnly) await waitForWifi(courseId, job);
      if (cancelled.has(courseId)) break;
      job.status = 'downloading';
      try {
        await item.fetch();
        fetched.add(item.key);
      } catch {
        // one item gone or failing shouldn't stop the rest; it's tried again on the next update
      }
      job.bytesDone += item.bytes;
      job[item.part] = { ...job[item.part], done: job[item.part].done + 1 };
      setJob(courseId, { ...job });
    }
  } finally {
    if (cancelled.has(courseId)) {
      setJob(courseId, null);
    } else {
      useOffline.setState((s) => ({
        saved: {
          ...s.saved,
          [courseId]: {
            savedAt: new Date().toISOString(),
            bytes: manifest.bytes,
            documentIds: manifest.documents.map((d) => d.id),
            items: [...fetched],
            wifiOnly,
          },
        },
      }));
      persist();
      setJob(courseId, null);
    }
  }
}

export function cancelDownload(courseId: string) {
  cancelled.add(courseId);
}

/** While a course is saved, new notes added to it are fetched too when its screen opens. */
export function useAutoUpdate(courseId: string) {
  const saved = useOffline((s) => s.saved[courseId]);
  const signedIn = Boolean(useAuth((s) => s.session));
  const lowData = useAppearance((s) => s.lowData);
  useEffect(() => {
    // Low-data mode: nothing downloads in the background; "Update" still works by hand.
    if (!saved || !signedIn || lowData) return;
    let live = true;
    void apiFetch<Manifest>(`/v1/courses/${courseId}/offline`)
      .then((m) => {
        if (!live) return;
        const have = new Set(saved.items);
        if (items(m).some((i) => !have.has(i.key))) void download(courseId, m, { wifiOnly: saved.wifiOnly, onlyNew: true });
      })
      .catch(() => {}); // offline: nothing to update
    return () => {
      live = false;
    };
    // Once per visit, not on every change to the saved record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, signedIn]);
}

/** "3.2 MB", "640 KB". */
export function size(bytes: number) {
  if (bytes < 100_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** "just now", "5 min ago", "3 hours ago", "on 12 Oct". */
export function updatedAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hour${mins < 90 ? '' : 's'} ago`;
  return `on ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}
