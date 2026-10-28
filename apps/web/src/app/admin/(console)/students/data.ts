// Sample data for 30f Students. TODO(E4): replace with profiles, usage_counters and referrals.
// Admins see display names, school, usage and flags only (WEB.md §3).

import type { TileData, Tone } from "@/components/admin/ui";

export const activeThisMonth = 186;

export const tiles: TileData[] = [
  { label: "Active this month", value: "186", note: "+38% vs September", ink: true },
  { label: "Active today", value: "74" },
  { label: "New this week", value: "41", note: "19 via invites" },
  { label: "Met weekly goal", value: "38%", note: "target 35%" },
  { label: "Week-4 retention", value: "31%", note: "Sept cohort" },
];

export const schools = [
  { name: "UNILAG", students: 142, share: 76 },
  { name: "UI", students: 21, share: 11 },
  { name: "OAU", students: 9, share: 5 },
  { name: "Other (12 schools)", students: 14, share: 8 },
];

export const sources = [
  { name: "Invite links", week: 19, share: 46 },
  { name: "Shared course links", week: 8, share: 20 },
  { name: "Play Store search", week: 11, share: 27 },
  { name: "Other", week: 3, share: 7 },
];

export type Student = {
  id: string;
  /** Display name ("Ada O."); null once deletion has started. */
  name: string | null;
  school: string;
  level: string;
  plan: string;
  lastActive: string | null;
  quizSets: number | null;
  aiCost: number | null;
  status: { text: string; tone: Tone };
  flagged?: boolean;
};

export const students: Student[] = [
  { id: "#A41F", name: "Tolu A.", school: "UNILAG", level: "200L", plan: "Free", lastActive: "Today", quizSets: 41, aiCost: 0.92, status: { text: "Active", tone: "success" } },
  { id: "#7C02", name: "Kemi B.", school: "UNILAG", level: "200L", plan: "Free", lastActive: "Today", quizSets: 33, aiCost: 0.71, status: { text: "Active", tone: "success" } },
  { id: "#E9B5", name: "Ada O.", school: "UNILAG", level: "200L", plan: "Free", lastActive: "Yesterday", quizSets: 29, aiCost: 0.64, status: { text: "Active", tone: "success" } },
  { id: "#1D88", name: "Femi E.", school: "UI", level: "300L", plan: "Free", lastActive: "3 days ago", quizSets: 12, aiCost: 0.21, status: { text: "Active", tone: "success" } },
  { id: "#55C1", name: "Zara M.", school: "OAU", level: "100L", plan: "Free", lastActive: "Today", quizSets: 6, aiCost: 0.09, status: { text: "Active", tone: "success" } },
  { id: "#0B7E", name: "Chidi N.", school: "UNILAG", level: "100L", plan: "Free", lastActive: "9 days ago", quizSets: 2, aiCost: 0.03, status: { text: "Limit abuse flag", tone: "warning" }, flagged: true },
  { id: "#9F30", name: null, school: "UNILAG", level: "300L", plan: "Free", lastActive: null, quizSets: null, aiCost: null, status: { text: "Deleting · 24 h", tone: "outline" } },
];

/** School filter pills with their totals (from the whole table, not just the rows shown). */
export const schoolFilters = [
  { value: "UNILAG", count: 142 },
  { value: "UI", count: 21 },
  { value: "OAU", count: 9 },
];
export const flaggedCount = 1;
