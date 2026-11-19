// Shapes of the admin API's answers (services/api/app/api/admin.py; docs/api/openapi.json).

export type Range = "today" | "7d" | "30d";

export type Health = {
  waiting: number;
  running: number;
  failed_24h: number;
  worker_beat_s: number | null;
  breakers: { provider: string; open: boolean }[];
};

export type Overview = {
  active: number;
  active_month: number;
  signups: number;
  invited: number;
  documents: number;
  duplicates: number;
  open_reports: number;
  auto_hidden: number;
  cost_today: number;
  daily_budget_usd: number;
  providers: { provider: string; day: string; cost: number }[];
  attention: {
    type: string;
    target_id: string;
    note: string | null;
    reason: string;
    reports: number;
    last_at: string;
    hidden: boolean;
  }[];
  health: Health;
};

export type Costs = {
  calls: number;
  free_calls: number;
  list_usd: number;
  paid_usd: number;
  active: number;
  daily: { day: string; paid_usd: number }[];
  providers: { provider: string; calls: number; errors: number; p50_ms: number | null; paid_usd: number }[];
  tasks: { task: string; model: string; calls: number; tokens_in: number; tokens_out: number; list_usd: number }[];
  top_students: { id: string; school: string | null; level: string | null; plan: string; list_usd: number; quiz_sets: number }[];
  health: Health;
};

export type System = {
  health: Health;
  jobs: { job: string; done: number; failed: number; p50_s: number | null; p95_s: number | null }[];
  upload_to_ready: { p50_s: number | null; p95_s: number | null };
  failures: { id: string; job: string; at: string; attempts: number; max_attempts: number; reason: string }[];
};

export type StudentsSummary = {
  active_month: number;
  active_today: number;
  new_week: number;
  invited_week: number;
  goal_met_share: number | null;
  week4_retention: number | null;
  schools: { name: string; students: number }[];
  sources: { channel: string; n: number }[];
};

export type StudentRow = {
  id: string;
  name: string | null;
  school: string | null;
  level: string | null;
  plan: string;
  created_at: string;
  last_active: string | null;
  quiz_sets: number;
  ai_cost_usd: number | null;
  status: "active" | "paused" | "deleting";
};

export type ReportTarget = "question" | "explanation" | "chat_message" | "course";

export type ReportGroup = {
  type: ReportTarget;
  target_id: string;
  reports: number;
  reporters: number;
  last_at: string;
  reason: string;
  note: string | null;
  hidden: boolean;
  preview: string;
};

export type ReportDetail = {
  type: ReportTarget;
  target_id: string;
  item: Record<string, unknown> | null;
  reporters: { reason: string; note: string | null; status: string; created_at: string; school: string | null; level: string | null }[];
};

export type Takedowns = {
  log: {
    id: string;
    target_type: "file" | "course";
    target: string;
    reason: string;
    requested_by: string | null;
    students_affected: number;
    admin_id: string;
    status: "active" | "reversed";
    created_at: string;
    reversed_at: string | null;
  }[];
  near_unshare: { code: string; title: string | null; share_code: string; member_count: number; reporters: number }[];
};

export type LimitField = {
  key: string;
  label: string;
  group: string;
  unit: string;
  min: number;
  max: number;
  decimals: boolean;
  default: number;
  value: number;
  changed: boolean;
};

export type Limits = {
  fields: LimitField[];
  changes: { admin_id: string; key: string | null; old: unknown; new: unknown; created_at: string }[];
  applies_within_s: number;
};

export const TYPE_LABEL: Record<ReportTarget, string> = {
  question: "Question",
  explanation: "Explanation",
  chat_message: "Chat answer",
  course: "Shared course",
};

export const PROVIDER_NAME: Record<string, string> = {
  groq: "Groq",
  openrouter: "OpenRouter",
  cloudflare: "Cloudflare",
};
