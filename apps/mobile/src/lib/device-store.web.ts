/** Web version of device-store.ts. Private browsing can refuse storage; then nothing is kept. */
export const deviceStore = {
  getItem: async (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // full or blocked: the app still works, just without the offline copy
    }
  },
  removeItem: async (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
