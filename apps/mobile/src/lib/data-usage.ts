import { create } from 'zustand';

import { deviceStore } from '@/lib/device-store';

/*
 * Roughly how much data Quizzly used this week (DESIGN.md §7, 18: "Low-data mode · This week:
 * 3.2 MB used"). Counts API requests and responses; images and the app download aren't included.
 */

const KEY = 'data.week';

function monday(d = new Date()) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${m.getMonth() + 1}-${m.getDate()}`;
}

type Usage = { week: string; bytes: number };
export const useDataUsage = create<Usage>(() => ({ week: monday(), bytes: 0 }));

void deviceStore.getItem(KEY).then((raw) => {
  try {
    const saved = raw ? (JSON.parse(raw) as Usage) : null;
    if (saved?.week === monday()) useDataUsage.setState((s) => ({ bytes: s.bytes + saved.bytes }));
  } catch {
    // start counting again
  }
});

let pending: ReturnType<typeof setTimeout> | null = null;

export function recordBytes(n: number) {
  const week = monday();
  useDataUsage.setState((s) => (s.week === week ? { bytes: s.bytes + n } : { week, bytes: n }));
  pending ??= setTimeout(() => {
    pending = null;
    void deviceStore.setItem(KEY, JSON.stringify(useDataUsage.getState()));
  }, 5000); // written at most every few seconds
}
