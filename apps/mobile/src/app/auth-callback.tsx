import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Google sign-in returns here. The auth session browser normally handles the redirect itself, but
// on some Android phones the OS opens the app with this link instead and the browser reports a
// dismiss. Then the sign-in code arrives here: finish the sign-in with it, then go on.
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [done, setDone] = useState(!code);

  useEffect(() => {
    if (!code) return;
    // The code may already have been used by the auth session; that error is harmless.
    void supabase.auth
      .exchangeCodeForSession(code)
      .catch(() => {})
      .finally(() => setDone(true));
  }, [code]);

  return done ? <Redirect href="/" /> : null;
}
