// Sample data for 30b AI costs. TODO(E4): replace with llm_calls aggregates (FR-LIM-02) and provider_limits.

import type { TileData, Tone } from "@/components/admin/ui";
import type { Range } from "@/lib/admin/mock";

export const eyebrow: Record<Range, string> = {
  today: "Today · Monday 26 Oct",
  "7d": "Last 7 days · 20 – 26 Oct",
  "30d": "Last 30 days · 27 Sep – 26 Oct",
};

export const tiles: Record<Range, TileData[]> = {
  today: [
    { label: "AI usage today", value: "$0.42", note: "list price · $0.11 paid after free tiers" },
    { label: "Per active student", value: "$0.006", note: "74 active today" },
    { label: "AI calls", value: "312", note: "plus ~150 served from cache" },
    { label: "Free-tier share", value: "71%", note: "of calls cost $0" },
  ],
  "7d": [
    { label: "AI usage, 7 days", value: "$3.73", note: "list price · $1.18 paid after free tiers" },
    { label: "Per active student", value: "$0.028", note: "131 active in 7 days" },
    { label: "AI calls", value: "2,690", note: "plus ~1,250 served from cache" },
    { label: "Free-tier share", value: "69%", note: "of calls cost $0" },
  ],
  "30d": [
    { label: "AI usage this month", value: "$14.36", note: "list price · $4.60 paid after free tiers" },
    { label: "Per active student", value: "$0.077", note: "186 active this month" },
    { label: "AI calls", value: "10,540", note: "plus ~4,900 served from cache" },
    { label: "Free-tier share", value: "68%", note: "of calls cost $0" },
  ],
};

export const dailyBudget = 2;
export const alertAt = 80;
export const breaker = "Closed";

/** Daily cost for the 30 days ending today (27 Sep – 26 Oct). */
export const daily = [
  0.36, 0.33, 0.41, 0.47, 0.51, 0.26, 0.22, 0.44, 0.55, 0.6, 0.57, 0.52, 0.28, 0.23, 0.48, 0.58, 0.64, 0.62, 0.56, 0.31,
  0.26, 0.67, 0.73, 0.77, 0.69, 0.59, 0.35, 0.31, 0.57, 0.42,
];
export const dailyAxis = ["27 Sep", "4 Oct", "11 Oct", "18 Oct"];

export const providers: { name: string; tone: Tone; status: string; fallback: number; p50: string; freeUsed: number; note: string }[] = [
  { name: "Groq", tone: "success", status: "Healthy", fallback: 1, p50: "0.9 s", freeUsed: 62, note: "llama-3.3-70b, llama-3.1-8b · paid key ready as last resort" },
  { name: "OpenRouter", tone: "success", status: "Healthy", fallback: 2, p50: "1.6 s", freeUsed: 41, note: ":free models · 1,000 requests/day" },
  { name: "Cloudflare", tone: "warning", status: "Slow", fallback: 3, p50: "2.8 s", freeUsed: 18, note: "Workers AI · 10k neurons/day free" },
];

/** `share` is % of cost, rounded so the column adds up to 100. */
export const tasks = [
  { task: "Question sets", share: 40, model: "llama-3.3-70b", calls: 820, tokensIn: 5.9, tokensOut: 2.95, cached: 52, cost: 5.82 },
  { task: "Explanations", share: 26, model: "llama-3.3-70b", calls: 1140, tokensIn: 4.56, tokensOut: 1.37, cached: 58, cost: 3.77 },
  { task: "Theory marking", share: 11, model: "llama-3.3-70b", calls: 960, tokensIn: 1.92, tokensOut: 0.48, cached: null, cost: 1.51 },
  { task: "Outlines", share: 10, model: "llama-3.3-70b", calls: 260, tokensIn: 2.08, tokensOut: 0.26, cached: 71, cost: 1.43 },
  { task: "Chat", share: 9, model: "llama-3.1-8b", calls: 6400, tokensIn: 22.4, tokensOut: 2.56, cached: null, cost: 1.32 },
  { task: "Flashcards", share: 3, model: "llama-3.3-70b", calls: 140, tokensIn: 0.42, tokensOut: 0.21, cached: 49, cost: 0.41 },
  { task: "Question checks", share: 1, model: "llama-3.1-8b", calls: 820, tokensIn: 1.64, tokensOut: 0.16, cached: null, cost: 0.1 },
] satisfies { task: string; model: string; calls: number; tokensIn: number; tokensOut: number; cached: number | null; cost: number; share: number }[];

/** IDs only, never names (WEB.md §3). */
export const topStudents = [
  { id: "#A41F", school: "UNILAG · 200L", plan: "Free", quizSets: 41, cost: 0.92 },
  { id: "#7C02", school: "UNILAG · 200L", plan: "Free", quizSets: 33, cost: 0.71 },
  { id: "#E9B5", school: "UNILAG · 200L", plan: "Free", quizSets: 29, cost: 0.64 },
  { id: "#1D88", school: "UI · 300L", plan: "Free", quizSets: 12, cost: 0.21 },
];
