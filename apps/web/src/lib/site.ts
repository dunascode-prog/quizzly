// Values read at build time. See apps/web/README.md for the env vars.

export const DOMAIN = process.env.INVITE_DOMAIN || "quizzly.app";
export const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || "app.quizzly";

// Until the Play listing exists, fall back to the listing URL for our package name.
export const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL || `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export const IPHONE_WAITLIST_URL = "/waitlist";
export const CONTACT_EMAIL = `hello@${DOMAIN}`;

// The Quizzly API the link pages and waitlist call from the browser. Its CORS_ORIGINS must list
// this site's origin.
export const API_URL = (process.env.API_URL || `https://api.${DOMAIN}`).replace(/\/$/, "");

// Android App Links (FR-INV-02): SHA-256 fingerprints of the certificates that sign the app,
// comma-separated (Play Console → App integrity → App signing). Empty until the app is on Play.
export const ANDROID_CERT_SHA256 = (process.env.ANDROID_CERT_SHA256 || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Supabase Auth for the admin app's team sign-in (email code + authenticator). The anon key is
// public by design; admin rights come only from app_metadata, checked by the API on every call.
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

export type AdminEnvironment = {
  id: string; // "staging", "production"
  label: string;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

// The environments the admin app can switch between: a JSON list in ADMIN_ENVIRONMENTS, e.g.
// [{"id":"staging","label":"Staging","apiUrl":"…","supabaseUrl":"…","supabaseAnonKey":"…"}, …].
// Without it, one environment from API_URL and SUPABASE_*.
function adminEnvironments(): AdminEnvironment[] {
  const raw = process.env.ADMIN_ENVIRONMENTS;
  if (raw) {
    try {
      const list = (JSON.parse(raw) as AdminEnvironment[]).filter((e) => e.id && e.apiUrl && e.supabaseUrl && e.supabaseAnonKey);
      if (list.length) return list.map((e) => ({ ...e, label: e.label || e.id, apiUrl: e.apiUrl.replace(/\/$/, "") }));
    } catch {
      console.warn("ADMIN_ENVIRONMENTS isn't valid JSON; using API_URL and SUPABASE_* instead");
    }
  }
  return [{ id: "default", label: "Quizzly", apiUrl: API_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }];
}

export const ADMIN_ENVIRONMENTS = adminEnvironments();
