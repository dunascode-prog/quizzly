// The expo-sqlite localStorage polyfill held the session before FR-AUTH-06; it's read once to
// move an existing session into secure storage, so nobody is signed out by the update.
import 'expo-sqlite/localStorage/install';

import * as SecureStore from 'expo-secure-store';

/*
 * Supabase session storage on phones: the device's secure storage (Keychain / Keystore), never
 * plain storage (FR-AUTH-06, FR-SEC-09). Values are split into chunks, because some iOS versions
 * reject secure-store values over about 2 KB and a session with its refresh token is larger.
 * session-storage.web.ts keeps localStorage on the web, where there's no secure store.
 */

const CHUNK = 1800;
// Readable after the first unlock, so the token can be refreshed while the phone is locked.
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** Secure-store keys allow only letters, digits, ".", "-" and "_". */
function safe(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function read(key: string): Promise<string | null> {
  const count = await SecureStore.getItemAsync(`${safe(key)}.chunks`, OPTIONS);
  if (count === null) return null;
  const parts: string[] = [];
  for (let i = 0; i < Number(count); i++) {
    const part = await SecureStore.getItemAsync(`${safe(key)}.${i}`, OPTIONS);
    if (part === null) return null; // half-written: treat as signed out
    parts.push(part);
  }
  return parts.join('');
}

async function remove(key: string) {
  const count = await SecureStore.getItemAsync(`${safe(key)}.chunks`, OPTIONS);
  await SecureStore.deleteItemAsync(`${safe(key)}.chunks`, OPTIONS);
  for (let i = 0; i < Number(count ?? 0); i++) {
    await SecureStore.deleteItemAsync(`${safe(key)}.${i}`, OPTIONS);
  }
}

async function write(key: string, value: string) {
  await remove(key); // drop chunks a longer old value may have left behind
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK) parts.push(value.slice(i, i + CHUNK));
  if (parts.length === 0) parts.push('');
  for (const [i, part] of parts.entries()) {
    await SecureStore.setItemAsync(`${safe(key)}.${i}`, part, OPTIONS);
  }
  // Written last: until it exists, a reader sees no value rather than a partial one.
  await SecureStore.setItemAsync(`${safe(key)}.chunks`, String(parts.length), OPTIONS);
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await read(key);
    if (value !== null) return value;
    // One-time move from the old plain storage.
    const legacy = globalThis.localStorage?.getItem(key) ?? null;
    if (legacy !== null) {
      await write(key, legacy);
      globalThis.localStorage.removeItem(key);
    }
    return legacy;
  },
  setItem: write,
  async removeItem(key: string) {
    await remove(key);
    globalThis.localStorage?.removeItem(key);
  },
};
