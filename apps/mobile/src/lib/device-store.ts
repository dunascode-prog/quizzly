import Storage from 'expo-sqlite/kv-store';

/**
 * Small key-value storage that survives restarts: SQLite on phones (ARCHITECTURE §5.7);
 * device-store.web.ts uses localStorage instead, as expo-sqlite on web is still alpha.
 */
export const deviceStore = {
  getItem: (key: string) => Storage.getItem(key),
  setItem: (key: string, value: string) => Storage.setItem(key, value),
  removeItem: (key: string) => Storage.removeItem(key),
};
