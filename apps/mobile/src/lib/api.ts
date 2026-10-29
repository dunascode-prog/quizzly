import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { recordBytes } from '@/lib/data-usage';
import { env } from '@/lib/env';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function accessToken() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function errorFrom(status: number, body: unknown, fallback: string) {
  // FastAPI sends a sentence for our own errors and a list for request-validation errors.
  const raw = (body as { detail?: unknown } | null)?.detail;
  const detail = Array.isArray(raw) ? raw[0]?.msg : raw;
  return new ApiError(status, typeof detail === 'string' ? detail : fallback);
}

/** Calls the Quizzly API, attaching the signed-in student's access token when there is one. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const token = await accessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    throw errorFrom(response.status, await response.json().catch(() => null), response.statusText);
  }
  const sent = typeof init.body === 'string' ? init.body.length : 0;
  if (response.status === 204) {
    recordBytes(sent);
    return undefined as T;
  }
  const text = await response.text();
  recordBytes(sent + text.length); // for "This week: … used" in low-data mode
  return JSON.parse(text) as T;
}

/** PUTs a local file to the API as the raw request body (the profile photo, FR-PROF-04). */
export async function apiUpload<T>(path: string, uri: string, mimeType: string): Promise<T> {
  const token = await accessToken();
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': mimeType };
  if (token) headers.Authorization = `Bearer ${token}`;
  let status: number;
  let text: string;
  if (Platform.OS === 'web') {
    const body = await (await fetch(uri)).blob();
    const response = await fetch(`${env.apiUrl}${path}`, { method: 'PUT', headers, body });
    [status, text] = [response.status, await response.text()];
  } else {
    const file = new File(uri);
    const result = await file.upload(`${env.apiUrl}${path}`, { httpMethod: 'PUT', mimeType, headers });
    [status, text] = [result.status, result.body];
    recordBytes(file.size);
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (status < 200 || status >= 300) throw errorFrom(status, body, `HTTP ${status}`);
  return body as T;
}
