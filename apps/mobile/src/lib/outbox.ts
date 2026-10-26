import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deviceStore } from '@/lib/device-store';
import { queryClient } from '@/lib/query-client';
import type { AnswerIn, Attempt, Mode } from '@/lib/quiz';

/*
 * Quiz work done offline waits here and is sent when the device reconnects (FR-OFF-02,
 * ARCHITECTURE §5.7). Every request carries ids the app chose (attempt id, answer ids), and the
 * API treats a repeat as the same request, so a resend never makes a duplicate.
 */

type Base = { userId: string; attemptId: string };
export type OutboxItem =
  | (Base & { kind: 'start'; quizId: string; mode: Mode })
  | (Base & { kind: 'answers'; answers: AnswerIn[]; currentIndex: number })
  | (Base & { kind: 'submit'; answers: AnswerIn[] });

type NewItem = OutboxItem extends infer T ? (T extends OutboxItem ? Omit<T, 'userId'> : never) : never;

const KEY = 'quizzly.outbox';
let items: OutboxItem[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  loaded ??= deviceStore.getItem(KEY).then((raw) => {
    try {
      items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    } catch {
      items = [];
    }
    listeners.forEach((l) => l());
  });
  return loaded;
}

async function save(next: OutboxItem[]) {
  items = next;
  listeners.forEach((l) => l());
  await deviceStore.setItem(KEY, JSON.stringify(next));
}

function currentUser() {
  return useAuth.getState().session?.user.id ?? null;
}

/** Queues work for the signed-in student. Saves for one attempt merge into a single item. */
export async function enqueue(item: NewItem) {
  await load();
  const userId = currentUser();
  if (!userId) return;
  const full = { ...item, userId } as OutboxItem;
  const last = items[items.length - 1];
  if (full.kind === 'start') {
    // An answer can be saved while the start request is still failing; the start must go first.
    const at = items.findIndex((i) => i.attemptId === full.attemptId);
    await save(at < 0 ? [...items, full] : [...items.slice(0, at), full, ...items.slice(at)]);
  } else if (full.kind === 'answers' && last?.kind === 'answers' && last.attemptId === full.attemptId) {
    const ids = new Set(full.answers.map((a) => a.question_id));
    const merged: OutboxItem = {
      ...last,
      answers: [...last.answers.filter((a) => !ids.has(a.question_id)), ...full.answers],
      currentIndex: Math.max(last.currentIndex, full.currentIndex),
    };
    await save([...items.slice(0, -1), merged]);
  } else {
    await save([...items, full]);
  }
}

async function send(item: OutboxItem) {
  if (item.kind === 'start') {
    await apiFetch<Attempt>(`/v1/quizzes/${item.quizId}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ id: item.attemptId, mode: item.mode }),
    });
  } else if (item.kind === 'answers') {
    const attempt = await apiFetch<Attempt>(`/v1/attempts/${item.attemptId}/answers`, {
      method: 'PUT',
      body: JSON.stringify({ answers: item.answers, current_index: item.currentIndex }),
    });
    queryClient.setQueryData(['attempt', attempt.id], attempt);
  } else {
    const attempt = await apiFetch<Attempt>(`/v1/attempts/${item.attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers: item.answers }),
    });
    queryClient.setQueryData(['attempt', attempt.id], attempt);
  }
}

/** The server won't accept this however often it's sent (already submitted, time up, gone). */
function rejected(e: unknown) {
  return e instanceof ApiError && [404, 409, 422].includes(e.status);
}

let flushing: Promise<void> | null = null;
let again = false;

async function sendAll() {
  await load();
  const userId = currentUser();
  let sent = false;
  for (;;) {
    const item = items.find((i) => i.userId === userId);
    if (!item) break;
    try {
      await send(item);
    } catch (e) {
      if (!rejected(e)) break; // offline or a server hiccup: keep it for the next try
    }
    sent = true;
    await save(items.filter((i) => i !== item));
  }
  if (sent) void queryClient.invalidateQueries({ queryKey: ['practice'] });
}

/** Sends queued work in order. Stops at the first network or server failure and tries again later.
 * A call made while sending runs once more afterwards (e.g. sign-in finished in the meantime). */
export function flush(): Promise<void> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    do {
      again = false;
      await sendAll();
    } while (again);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Whether anything for this attempt is still waiting to be sent. */
export function isPending(attemptId: string) {
  return items.some((i) => i.attemptId === attemptId);
}

const RETRY_MS = 30_000;

/** Retries on reconnect, when the app comes back to the foreground, and every 30 s while anything
 * is waiting (in case a reconnect event is missed). Call once. */
export function startOutbox() {
  if (typeof window === 'undefined') return; // web server rendering: no device to sync from
  void load().then(flush);
  NetInfo.addEventListener((state) => {
    if (state.isConnected) void flush();
  });
  onlineManager.subscribe((online) => {
    if (online) void flush();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void flush();
  });
  setInterval(() => {
    if (items.length && AppState.currentState !== 'background') void flush();
  }, RETRY_MS);
}

/** Quiz attempts of the signed-in student still waiting to sync. */
export function usePendingAttempts() {
  const userId = useAuth((s) => s.session?.user.id);
  const snapshot = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      void load();
      return () => listeners.delete(onChange);
    },
    () => items,
  );
  return new Set(snapshot.filter((i) => i.userId === userId).map((i) => i.attemptId)).size;
}
