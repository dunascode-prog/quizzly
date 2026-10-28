// Values read at build time. See apps/web/README.md for the env vars.

export const DOMAIN = process.env.INVITE_DOMAIN || "quizzly.app";
export const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || "app.quizzly";

// Until the Play listing exists, fall back to the listing URL for our package name.
export const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL || `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export const IPHONE_WAITLIST_URL = "/waitlist";
export const CONTACT_EMAIL = `hello@${DOMAIN}`;
