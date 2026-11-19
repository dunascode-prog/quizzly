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
