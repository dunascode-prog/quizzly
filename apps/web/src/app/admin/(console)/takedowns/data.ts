// Sample data for 30d Takedowns. TODO(E4): replace with takedown log, source_files.blocked and course_shares (FR-MOD-04/05).

export type TargetType = "File" | "Shared course" | "Question set";

export type Takedown = {
  id: string;
  date: string;
  target: string;
  detail: string;
  type: TargetType;
  reason: string;
  affected: number | null;
  by: string;
  active: boolean;
};

export const targetTypes = [
  { value: "File", label: "File" },
  { value: "Shared course", label: "Shared course" },
  { value: "Question set", label: "Question set" },
] as const satisfies readonly { value: TargetType; label: string }[];

/** Field label, placeholder and the consequences spelled out next to the red button, per target type. */
export const targetCopy: Record<TargetType, { label: string; placeholder: string; consequence: string }> = {
  File: {
    label: "SHA-256 of the file",
    placeholder: "9f2c41e8…b07a81",
    consequence:
      "Deletes derived content (outline, explanations, questions), blocks re-upload of this file, and removes it from shared courses within 1 minute. Students' own scores stay.",
  },
  "Shared course": {
    label: "Share code or link",
    placeholder: "/c/7KQ2M9XD",
    consequence: "Stops sharing the course and turns off its link within 1 minute. The owner keeps their own copy. Members' own scores stay.",
  },
  "Question set": {
    label: "Question set ID",
    placeholder: "qs_4F7A…",
    consequence: "Removes every question in the set from quizzes within 1 minute. Students' own scores stay.",
  },
};

export const log: Takedown[] = [
  { id: "t1", date: "24 Oct", target: "9f2c…a81", detail: "MTH 201 past paper 2024.pdf", type: "File", reason: "Copyright request", affected: 52, by: "Seyitan", active: true },
  { id: "t2", date: "19 Oct", target: "/c/7KQ2M9XD", detail: "BIO 101 · Cell biology", type: "Shared course", reason: "5 member reports (auto)", affected: 140, by: "System", active: true },
  { id: "t3", date: "12 Oct", target: "3ab0…e17", detail: "Wrong upload, student request", type: "File", reason: "Uploader request", affected: 1, by: "Seyitan", active: false },
];

/** Owners appear by display name only (CLAUDE.md: "Ada O."). */
export const nearUnshare = [
  { course: "CHM 102 · Organic basics", owner: "Ada O. (UNILAG)", members: 88, reports: 4 },
  { course: "ECO 201 · Micro", owner: "Femi E. (UI)", members: 31, reports: 3 },
];
export const unshareAt = 5;
