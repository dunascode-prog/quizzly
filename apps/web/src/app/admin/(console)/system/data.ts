// Sample data for 30g System. TODO(E4): replace with jobs, worker_heartbeats and the Supabase usage API.

import type { TileData, Tone } from "@/components/admin/ui";

export const tiles: TileData[] = [
  { label: "Jobs waiting", value: "3", note: "2 running now", ink: true },
  { label: "Failed in 24 h", value: "4", note: "1 needs a look" },
  { label: "Worker", value: "Online", note: "last heartbeat 12 s ago" },
  { label: "Upload → ready (p50)", value: "48 s", note: "p95 2 min 40 s" },
];

export const jobs = [
  { job: "ingest_document", done: 23, failed: 2, p50: "31 s", p95: "2 min 10 s" },
  { job: "build_outline", done: 9, failed: 0, p50: "6 s", p95: "14 s" },
  { job: "generate_questions", done: 61, failed: 1, p50: "18 s", p95: "41 s" },
  { job: "generate_explanation", done: 88, failed: 0, p50: "7 s", p95: "19 s" },
  { job: "mark_answers", done: 74, failed: 0, p50: "5 s", p95: "12 s" },
  { job: "send_push", done: 412, failed: 1, p50: "0.4 s", p95: "1.2 s" },
  { job: "schedule_reminders", done: 96, failed: 0, p50: "1.1 s", p95: "2.0 s" },
  { job: "update_mastery", done: 310, failed: 0, p50: "0.2 s", p95: "0.6 s" },
];

/** `permanent` failures (FR-SEC-06 reasons) can be opened; retried ones and dropped tokens can't. */
export const failures: { id: string; when: string; job: string; attempt?: string; reason: string; tone: Tone; permanent: boolean }[] = [
  { id: "f1", when: "10:42", job: "ingest_document", attempt: "attempt 1 of 5", reason: "encrypted", tone: "danger", permanent: true },
  { id: "f2", when: "09:15", job: "ingest_document", attempt: "attempt 1 of 5", reason: "too_large · 61 MP", tone: "danger", permanent: true },
  { id: "f3", when: "08:03", job: "generate_questions", attempt: "attempt 2 of 5", reason: "timeout → retried, ok", tone: "warning", permanent: false },
  { id: "f4", when: "Yesterday", job: "send_push", reason: "token removed", tone: "outline", permanent: false },
];

export const supabase = {
  plan: "Pro",
  period: "Billing period 1–31 Oct",
  usage: [
    { label: "Database", used: 2.1, limit: 8, unit: "GB" },
    { label: "File storage", used: 14, limit: 100, unit: "GB" },
    { label: "Egress this month", used: 18, limit: 250, unit: "GB" },
    { label: "Realtime peak connections", used: 22, limit: 500, unit: "" },
    { label: "Realtime messages", used: 0.16, limit: 5, unit: "M" },
  ],
};

export const breakers: { name: string; note?: string; state: string; tone: Tone; p50: string }[] = [
  { name: "Groq", state: "Closed", tone: "success", p50: "0.9 s" },
  { name: "OpenRouter", state: "Closed", tone: "success", p50: "1.6 s" },
  { name: "Cloudflare", note: "6 errors in 1 h", state: "Half-open", tone: "warning", p50: "2.8 s" },
];
