import { useQuery } from '@tanstack/react-query';
import { fetch as streamingFetch } from 'expo/fetch';

import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { queryClient } from '@/lib/query-client';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: { page: number }[];
  /** False when the notes didn't answer it (FR-CHAT-03); null on the student's own messages. */
  grounded: boolean | null;
  created_at: string;
};

type Chat = { thread_id: string | null; messages: ChatMessage[] };
type Done = { thread_id: string; question: ChatMessage; answer: ChatMessage };

/** Already worded for the student by the API ("High demand right now…"). */
export class ChatStreamError extends Error {}

export function useChat(documentId: string) {
  return useQuery({
    queryKey: ['chat', documentId],
    queryFn: () => apiFetch<Chat>(`/v1/documents/${documentId}/chat`),
    enabled: Boolean(useAuth((s) => s.session)),
  });
}

/**
 * Asks a question and streams the answer over Server-Sent Events (FR-CHAT-04). `onText` gets the
 * reply so far after every token. Resolves once both messages are stored.
 */
export async function ask(documentId: string, text: string, onText: (soFar: string) => void): Promise<Done> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await streamingFetch(`${env.apiUrl}/v1/documents/${documentId}/chat/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, (body?.detail as string) ?? response.statusText);
  }
  if (!response.body) throw new ChatStreamError('Something went wrong while answering. Try again.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let soFar = '';
  let done: Done | null = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    // Events are separated by a blank line: "event: token\ndata: {...}\n\n".
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const name = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!name || !data) continue;
      const payload = JSON.parse(data);
      if (name === 'token') {
        soFar += payload.text;
        onText(soFar);
      } else if (name === 'error') {
        throw new ChatStreamError(payload.detail);
      } else if (name === 'done') {
        done = payload as Done;
      }
    }
    if (finished) break;
  }
  if (!done) throw new ChatStreamError('The answer was cut off. Check your connection and try again.');

  queryClient.setQueryData<Chat>(['chat', documentId], (old) => ({
    thread_id: done.thread_id,
    messages: [...(old?.messages ?? []), done.question, done.answer],
  }));
  void queryClient.invalidateQueries({ queryKey: ['usage'] });
  return done;
}

const CITATION = /[ \t]?\[p\.\s*\d{1,4}\]/g;
const OUTSIDE = /\s*NOT IN YOUR NOTES:\s*/i;

/** The part from the notes (citations removed; they show as chips) and the "not in your notes" part. */
export function splitReply(content: string): { answer: string; outside: string | null } {
  const [answer, outside] = content.split(OUTSIDE, 2);
  return { answer: answer.replace(CITATION, '').trim(), outside: outside?.replace(CITATION, '').trim() || null };
}

/** Pages cited so far in a reply that is still streaming. */
export function citedPages(content: string): number[] {
  const pages = [...content.split(OUTSIDE, 1)[0].matchAll(/\[p\.\s*(\d{1,4})\]/g)].map((m) => Number(m[1]));
  return [...new Set(pages)];
}
