// Shared sample data for the admin shell. Each page keeps its own sample data in a data.ts next to it,
// copied from the approved designs (docs/reference/admin-*.html). The admin API (WEB.md §3, BUILD_PLAN E4)
// isn't built yet; swapping those constants for fetches is the whole change when it lands.

import type { BarPoint, Tone } from "@/components/admin/ui";

export type Range = "today" | "7d" | "30d";
export const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const satisfies readonly { value: Range; label: string }[];

export const admin = {
  name: "Seyitan",
  role: "Owner",
  initials: "SO",
};

export const shell = {
  openReports: 14,
  status: ["Beta · 186 active students", "Providers: all healthy"],
};

/** When the sample data was taken, in Lagos time. */
export const asOf = "2026-10-26T18:40:00+01:00";

/** Daily points ending today (Monday 26 Oct in the sample data). */
export const week = (values: number[]): BarPoint[] =>
  ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"].map((d, i) => ({ day: d[0], label: d, value: values[i] }));

export type HealthRow = { label: string; tone: Tone; text: string };
