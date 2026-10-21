import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

// Used for sign-in only; all data goes through the Quizzly API (ARCHITECTURE §5.6).
export const supabase = createClient(env.supabaseUrl || 'http://localhost', env.supabaseAnonKey || 'missing', {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
