import { AuthError } from '@supabase/supabase-js';

import { ApiError } from '@/lib/api';

const OFFLINE = "You're offline. Check your connection and try again.";
const GENERIC = 'Something went wrong. Try again.';
const GOOGLE_OFF = "Google sign-in isn't available yet. Use your email instead.";
const SERVER = "Quizzly couldn't finish that just now. Try again in a few minutes.";

/** Turns any thrown error into one plain sentence for the student (DESIGN.md §11). */
export function friendlyError(error: unknown): string {
  // The student sees one plain sentence; the developer terminal gets the real cause.
  if (__DEV__) console.warn('[friendlyError]', error);
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'otp_expired':
        return 'That code is wrong or has expired. Check it or ask for a new one.';
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return 'Too many tries. Wait a few minutes, then try again.';
      case 'provider_disabled':
        return GOOGLE_OFF;
      case 'email_address_invalid':
        return 'Enter a valid email address.';
      case 'validation_failed':
        // Supabase also uses this code for "Unsupported provider: provider is not enabled".
        return /provider/i.test(error.message) ? GOOGLE_OFF : 'Enter a valid email address.';
    }
    if (error.status === 429) return 'Too many tries. Wait a few minutes, then try again.';
    // auth-js files both "no network" (status 0) and server errors (5xx) as retryable.
    if (error.name === 'AuthRetryableFetchError') return error.status ? SERVER : OFFLINE;
    return GENERIC;
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has ended. Sign in again.';
    if (error.status === 429) return error.message;
    return GENERIC;
  }
  if (error instanceof TypeError) return OFFLINE; // fetch rejects with TypeError when there is no network
  return GENERIC;
}
