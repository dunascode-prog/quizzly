// Sample data for 30c Reports. TODO(E4): replace with reports, questions and attempt_answers (FR-MOD-01/02).
// Reporters appear only as school + level + time, never by name (WEB.md §3).

export type Kind = "Question" | "Explanation" | "Chat answer" | "Shared course";

export type Report = {
  id: string;
  kind: Kind;
  reason: "Wrong" | "Unclear" | "Inappropriate";
  hidden: boolean;
  /** "26 Oct, 09:14" when hidden. */
  hiddenSince?: string;
  date: string;
  /** Newest reporter note, shown in the list. */
  note: string | null;
  /** What was reported: a question with options, or a passage of text. */
  item:
    | { type: "question"; format: string; text: string; options: string[]; stored: number; notes?: number }
    | { type: "text"; label: string; text: string };
  context: string;
  source?: { page: number; quote: string; check: string };
  reporters: { note: string | null; who: string; when: string; extra?: string }[];
  /** Past answers that a fix would re-mark. */
  answers?: number;
};

export const summary = { open: 14, hidden: 3, oldest: "4 days" };

/** Queue totals for the filter pills (the list below holds the newest reports). */
export const counts = { all: 14, Question: 9, Explanation: 3, "Chat answer": 2, hidden: 3, "Shared course": 2 };

export const reports: Report[] = [
  {
    id: "r1",
    kind: "Question",
    reason: "Wrong",
    hidden: true,
    hiddenSince: "26 Oct, 09:14",
    date: "26 Oct",
    note: "Answer says O(n) but my notes say O(1).",
    item: {
      type: "question",
      format: "Multiple choice",
      text: "What is the time complexity of push() on an array-based stack?",
      options: ["O(1)", "O(n)", "O(log n)", "O(n²)"],
      stored: 1,
      notes: 0,
    },
    context: 'CSC 225 · Week 5 – Stacks and queues · topic "Push, pop and peek" · used in 37 quizzes, 112 answers',
    source: {
      page: 14,
      quote: "All three operations run in O(1) time for both the array and the linked-list implementations, since only the top is touched.",
      check: "Grounding check at generation: passed (0.61). The explanation was right; the answer key was wrong.",
    },
    reporters: [
      { note: "Answer says O(n) but my notes say O(1).", who: "UNILAG 200L", when: "26 Oct, 08:41" },
      { note: "Wrong answer. Page 14 says O(1).", who: "UNILAG 200L", when: "26 Oct, 08:57" },
      { note: "This is wrong", who: "UNILAG 200L", when: "26 Oct, 09:14", extra: "auto-hidden after this report" },
      { note: null, who: "UI 300L", when: "26 Oct, 10:02" },
    ],
    answers: 112,
  },
  {
    id: "r2",
    kind: "Question",
    reason: "Unclear",
    hidden: true,
    hiddenSince: "26 Oct, 07:30",
    date: "26 Oct",
    note: "Options B and C say the same thing.",
    item: {
      type: "question",
      format: "Multiple choice",
      text: "Which data structure follows last in, first out?",
      options: ["Queue", "Stack", "Pile (LIFO list)", "Heap"],
      stored: 1,
    },
    context: 'CSC 225 · Week 5 – Stacks and queues · topic "Stack basics" · used in 21 quizzes, 64 answers',
    source: {
      page: 12,
      quote: "A stack is a last-in, first-out (LIFO) structure: the most recent item added is the first removed.",
      check: "Grounding check at generation: passed (0.72). Option C restates option B.",
    },
    reporters: [
      { note: "Options B and C say the same thing.", who: "UNILAG 200L", when: "26 Oct, 06:58" },
      { note: "Two right answers?", who: "UNILAG 200L", when: "26 Oct, 07:12" },
      { note: null, who: "UNILAG 200L", when: "26 Oct, 07:30", extra: "auto-hidden after this report" },
    ],
    answers: 64,
  },
  {
    id: "r3",
    kind: "Explanation",
    reason: "Wrong",
    hidden: false,
    date: "25 Oct",
    note: "Mixes up stack and queue in the example.",
    item: {
      type: "text",
      label: "Explanation",
      text: "A queue removes the newest item first, like a stack of plates where you take from the top.",
    },
    context: 'CSC 225 · Week 5 – Stacks and queues · topic "Queues" · shown 48 times',
    source: { page: 16, quote: "A queue is first-in, first-out (FIFO): items leave in the order they arrived.", check: "Grounding check at generation: passed (0.55)." },
    reporters: [
      { note: "Mixes up stack and queue in the example.", who: "UNILAG 200L", when: "25 Oct, 19:20" },
      { note: "The plates example is for stacks.", who: "OAU 200L", when: "25 Oct, 21:05" },
    ],
  },
  {
    id: "r4",
    kind: "Chat answer",
    reason: "Inappropriate",
    hidden: false,
    date: "25 Oct",
    note: null,
    item: { type: "text", label: "Chat answer", text: "Reported chat answer. Only the reported reply is shown, never the rest of the chat." },
    context: "MTH 201 · Chat with notes",
    reporters: [{ note: null, who: "UNILAG 100L", when: "25 Oct, 14:33" }],
  },
  {
    id: "r5",
    kind: "Question",
    reason: "Wrong",
    hidden: false,
    date: "24 Oct",
    note: "Marked my correct answer as wrong.",
    item: {
      type: "question",
      format: "True or false",
      text: "A linked list allows constant-time access to any element by index.",
      options: ["True", "False"],
      stored: 1,
    },
    context: 'CSC 225 · Week 4 – Linked lists · topic "Access and search" · used in 15 quizzes, 41 answers',
    source: { page: 9, quote: "Reaching the k-th node needs k steps from the head, so access by index is O(n).", check: "Grounding check at generation: passed (0.68). The stored answer matches the notes." },
    reporters: [{ note: "Marked my correct answer as wrong.", who: "UI 300L", when: "24 Oct, 22:10" }],
    answers: 41,
  },
  {
    id: "r6",
    kind: "Explanation",
    reason: "Unclear",
    hidden: false,
    date: "24 Oct",
    note: "Too long, needs an example.",
    item: {
      type: "text",
      label: "Explanation",
      text: "Amortised analysis averages the cost of a sequence of operations so that occasional expensive resizes are spread across many cheap pushes.",
    },
    context: 'CSC 225 · Week 5 – Stacks and queues · topic "Dynamic arrays" · shown 19 times',
    reporters: [{ note: "Too long, needs an example.", who: "UNILAG 200L", when: "24 Oct, 18:45" }],
  },
  {
    id: "r7",
    kind: "Question",
    reason: "Wrong",
    hidden: true,
    hiddenSince: "23 Oct, 16:02",
    date: "23 Oct",
    note: "Page 14 doesn't say this.",
    item: {
      type: "question",
      format: "Multiple choice",
      text: "Which operation is not supported by a basic stack?",
      options: ["push", "pop", "peek", "insert at index"],
      stored: 2,
      notes: 3,
    },
    context: 'CSC 225 · Week 5 – Stacks and queues · topic "Push, pop and peek" · used in 12 quizzes, 30 answers',
    source: { page: 14, quote: "A stack offers push, pop and peek; it gives no access below the top.", check: "Grounding check at generation: passed (0.58)." },
    reporters: [
      { note: "Page 14 doesn't say this.", who: "UNILAG 200L", when: "23 Oct, 15:12" },
      { note: "peek is on the page", who: "UNILAG 200L", when: "23 Oct, 15:40" },
      { note: null, who: "UNILAG 200L", when: "23 Oct, 16:02", extra: "auto-hidden after this report" },
    ],
    answers: 30,
  },
];
