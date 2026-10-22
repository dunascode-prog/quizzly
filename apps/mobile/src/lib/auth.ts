import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** False until the stored session has been read, so the app doesn't flash the sign-in screen. */
  ready: boolean;
};

export const useAuth = create<AuthState>(() => ({ session: null, ready: false }));

let started = false;

/** Reads the stored session once and keeps the store in sync (FR-AUTH-02). */
export function startAuthListener() {
  if (started) return;
  started = true;
  supabase.auth
    .getSession()
    .then(({ data }) => useAuth.setState({ session: data.session, ready: true }))
    .catch(() => useAuth.setState({ session: null, ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session, ready: true });
  });
}

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

/** Thrown when the student closes the Google window; callers should stay quiet. */
export class SignInCancelled extends Error {}

/** Google via Supabase OAuth (PKCE) in an auth session browser (FR-AUTH-01). */
export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new SignInCancelled();

  const params = new URL(result.url).searchParams;
  const code = params.get('code');
  if (!code) throw new Error(params.get('error_description') ?? 'Google sign-in did not finish.');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

/** Signs out on this device and clears cached data (FR-AUTH-04). */
export async function signOut() {
  await supabase.auth.signOut({ scope: 'local' });
  queryClient.clear();
}
