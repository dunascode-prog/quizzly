// Public build-time config. Only EXPO_PUBLIC_* values reach the app bundle, so never put secrets here.
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Error reports (NFR-09); empty turns them off. A DSN is safe to ship: it can only send events. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  /** Cloudflare Turnstile site key for the sign-in check (FR-SEC-23); empty skips the check. */
  turnstileSiteKey: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  /** A hostname allowed for that widget in Cloudflare; the phone check loads from it. */
  turnstileHost: process.env.EXPO_PUBLIC_TURNSTILE_HOST ?? 'quizzly.app',
};
