// Sample data for 30a Overview. TODO(E4): replace with GET /admin/overview.

import type { TileData } from "@/components/admin/ui";
import { type HealthRow, type Range, week } from "@/lib/admin/mock";

export type ReportType = "Question" | "Explanation" | "Chat answer" | "Shared course";

export const overview = {
  tiles: {
    today: [
      { label: "Active students today", value: "74", note: "186 this month" },
      { label: "New sign-ups this week", value: "41", note: "19 from invite links" },
      { label: "Documents processed today", value: "23", note: "7 were duplicates (free)" },
      { label: "Open reports", value: "14", note: "3 auto-hidden" },
    ],
    "7d": [
      { label: "Active students, 7 days", value: "131", note: "186 this month" },
      { label: "New sign-ups this week", value: "41", note: "19 from invite links" },
      { label: "Documents processed, 7 days", value: "142", note: "38 were duplicates (free)" },
      { label: "Open reports", value: "14", note: "3 auto-hidden" },
    ],
    "30d": [
      { label: "Active students, 30 days", value: "186", note: "+38% vs September" },
      { label: "New sign-ups, 30 days", value: "112", note: "47 from invite links" },
      { label: "Documents processed, 30 days", value: "538", note: "141 were duplicates (free)" },
      { label: "Open reports", value: "14", note: "3 auto-hidden" },
    ],
  } satisfies Record<Range, TileData[]>,
  cost: { today: 0.42, budget: 2 },
  providers: [
    { name: "Groq", week: week([0.21, 0.19, 0.26, 0.22, 0.12, 0.1, 0.18]) },
    { name: "OpenRouter", week: week([0.14, 0.11, 0.17, 0.15, 0.08, 0.06, 0.16]) },
    { name: "Cloudflare", week: week([0.09, 0.07, 0.11, 0.1, 0.05, 0.04, 0.08]) },
  ],
  attention: [
    { type: "Question", note: "Answer says O(n) but my notes say O(1).", reports: 4, hidden: true },
    { type: "Question", note: "Options B and C say the same thing.", reports: 3, hidden: true },
    { type: "Explanation", note: "Mixes up stack and queue in the example.", reports: 2, hidden: false },
    { type: "Chat answer", note: "Inappropriate", reports: 1, hidden: false },
  ] satisfies { type: ReportType; note: string; reports: number; hidden: boolean }[],
  health: [
    { label: "Job queue", tone: "success", text: "3 queued · 0 failed" },
    { label: "Worker", tone: "success", text: "Online · beat 12 s ago" },
    { label: "Groq", tone: "success", text: "Healthy" },
    { label: "OpenRouter", tone: "success", text: "Healthy" },
    { label: "Cloudflare", tone: "warning", text: "Slow · 2.8 s p50" },
    { label: "Supabase", tone: "success", text: "DB 2.1 / 8 GB" },
  ] satisfies HealthRow[],
};
