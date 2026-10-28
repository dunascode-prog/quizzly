// Sample data for 30e Limits and plans. TODO(E4): replace with app_config and config_audit.
// Plans and prices are not decided yet (PRD Q3); only Free is live.

export const plans = [
  { key: "free", name: "Free", note: "everyone", live: true },
  { key: "student", name: "Student", note: "draft", live: false },
  { key: "premium", name: "Premium", note: "draft", live: false },
] as const;

export type PlanKey = (typeof plans)[number]["key"];

export const planLimits: { key: string; label: string; values: Record<PlanKey, number> }[] = [
  { key: "uploads_day", label: "Uploads per day", values: { free: 2, student: 5, premium: 10 } },
  { key: "question_sets_day", label: "Question sets per day", values: { free: 5, student: 15, premium: 30 } },
  { key: "explanations_day", label: "Explanations per day", values: { free: 10, student: 30, premium: 60 } },
  { key: "chat_day", label: "Chat messages per day", values: { free: 20, student: 60, premium: 150 } },
  { key: "marked_day", label: "Written answers marked per day", values: { free: 5, student: 15, premium: 30 } },
  { key: "flashcards_month", label: "Flashcard decks per month", values: { free: 10, student: 60, premium: 150 } },
  { key: "past_papers_month", label: "Past papers per month", values: { free: 0, student: 3, premium: 10 } },
  { key: "max_file_mb", label: "Max file size (MB)", values: { free: 25, student: 50, premium: 100 } },
  { key: "shares_day", label: "Course shares per day", values: { free: 10, student: 20, premium: 40 } },
];

/** From the cost model, for the limits above. */
export const worstCase: Record<PlanKey, string> = { free: "$0.60", student: "$2.96", premium: "$8.55" };
export const prices: Record<PlanKey, string | null> = { free: "Free", student: null, premium: null };

export const safety: { key: string; label: string; note?: string; value: number; prefix?: string; suffix?: string; decimals?: number }[] = [
  { key: "daily_ai_budget", label: "Daily AI budget", note: "Circuit breaker queues new AI work when reached", value: 2, prefix: "$", decimals: 2 },
  { key: "alert_pct", label: "Alert at", note: "Email to the owner", value: 80, suffix: "%" },
  { key: "otp_per_ip_hour", label: "Sign-in codes per IP per hour", note: "Stops sign-up abuse", value: 5 },
  { key: "share_opens_per_ip_min", label: "Share link opens per IP per minute", note: "FR-SHARE-10", value: 30 },
  { key: "members_per_course", label: "Members per shared course", value: 300 },
  { key: "invite_credits", label: "Invite credits per student", note: "FR-INV-03", value: 50 },
];

export const features: { key: string; label: string; note: string; on: boolean }[] = [
  { key: "sharing", label: "Course sharing", note: "In-app and link sharing", on: true },
  { key: "realtime", label: "Real-time notifications", note: "Supabase Realtime + push", on: true },
  { key: "invite_rewards", label: "Invite rewards", note: "Lavender theme at 3 friends", on: true },
  { key: "flashcards", label: "Flashcards", note: "P1 · rolling out to 20%", on: true },
  { key: "past_questions", label: "Past-question mode", note: "P1 · staff only", on: false },
  { key: "main_model_switch", label: "Main model: gpt-oss-120b", note: "About half the AI cost; test quality first", on: false },
];

export const changes = [
  { when: "25 Oct, 18:02", who: "Seyitan", change: "Free · question sets per day 15 → 5" },
  { when: "25 Oct, 18:02", who: "Seyitan", change: "Free · uploads per day 5 → 2" },
  { when: "22 Oct, 09:40", who: "Seyitan", change: "Flashcards rollout 0% → 20%" },
];
