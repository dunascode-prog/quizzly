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

/** Calls the Quizzly API, attaching the signed-in student's access token when there is one. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // FastAPI sends a sentence for our own errors and a list for request-validation errors.
    const detail = Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail;
    throw new ApiError(response.status, detail ?? response.statusText);
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
