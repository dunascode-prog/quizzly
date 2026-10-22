import '@/lib/crypto-polyfill';
import '@/lib/local-storage';

import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

// Undefined during web server-side rendering (Node); there is no session to keep there.
const storage = typeof localStorage === 'undefined' ? undefined : localStorage;

// Used for sign-in only; all data goes through the Quizzly API (ARCHITECTURE §5.6).
export const supabase = createClient(env.supabaseUrl || 'http://localhost', env.supabaseAnonKey || 'missing', {
  auth: {
    storage,
    autoRefreshToken: storage !== undefined,
    persistSession: storage !== undefined,
    detectSessionInUrl: false,
    // PKCE lets the Google redirect return a one-time code instead of tokens in the URL.
    flowType: 'pkce',
  },
});

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
