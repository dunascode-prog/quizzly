import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank' | 'short_answer' | 'theory';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type Mode = 'practice' | 'exam';

export type Question = {
  id: string;
  ordinal: number;
  type: QuestionType;
  difficulty: string;
  stem: string;
  options: string[] | null;
  answer: number | boolean | { text: string; alternatives: string[] } | { model_answer: string };
  explanation: string;
  source_pages: number[];
  topic_id: string | null;
  topic_title: string | null;
  marks: number;
  /** Short answer and theory: what the marker looks for (FR-QGEN-06). */
  rubric: { criteria: { criterion: string; marks: number }[] } | null;
};

export type Quiz = {
  id: string;
  title: string;
  document_id: string;
  mode: Mode;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  progress: number | null;
  requested_count: number;
  generated_count: number;
  notice: string | null;
  time_limit_sec: number | null;
  questions: Question[];
};

export type Response = number | boolean | string;

export type TopicResult = { topic_id: string; title: string | null; score: number; max: number };

/** The marker's verdict on a written answer (FR-QUIZ-04). */
export type Feedback = {
  status: 'marked' | 'not_marked';
  reason?: 'limit' | 'error' | 'empty';
  summary: string;
  criteria: { criterion: string; awarded: number; marks: number; feedback: string }[];
  model_answer: string;
};

export type AttemptAnswer = {
  question_id: string;
  response: Response;
  is_correct: boolean | null;
  /** Null while a written answer waits for marking. */
  score: number | null;
  feedback: Feedback | null;
};

export type Attempt = {
  id: string;
  quiz_id: string;
  title: string;
  document_id: string;
  time_limit_sec: number | null;
  mode: Mode;
  status: 'in_progress' | 'submitted' | 'marking' | 'completed';
  started_at: string;
  submitted_at: string | null;
  current_index: number;
  score: number | null;
  max_score: number | null;
  topics: TopicResult[];
  weakest: TopicResult[];
  answers: AttemptAnswer[];
};

export type AttemptSummary = Pick<
  Attempt,
  'id' | 'quiz_id' | 'title' | 'document_id' | 'mode' | 'status' | 'started_at' | 'submitted_at' | 'current_index' | 'score' | 'max_score'
> & { question_count: number };

export type WeakTopic = TopicResult & { document_id: string };

export type QuizSettings = {
  topic_ids: string[];
  types: QuestionType[];
  difficulty: Difficulty;
  count: 5 | 10 | 20 | 30;
  mode: Mode;
  new_questions?: boolean;
  /** Exam mode only (FR-QUIZ-02). */
  time_limit_min?: number;
};

function useSignedIn() {
  return Boolean(useAuth((s) => s.session));
}

export function createQuiz(documentId: string, settings: QuizSettings) {
  return apiFetch<Quiz>(`/v1/documents/${documentId}/quizzes`, { method: 'POST', body: JSON.stringify(settings) }).then(
    (quiz) => {
      queryClient.setQueryData(['quiz', quiz.id], quiz);
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
      return quiz;
    },
  );
}

/** Polls every 2 s while the worker writes the questions (FR-QGEN-08). */
export function useQuiz(quizId: string) {
  return useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => apiFetch<Quiz>(`/v1/quizzes/${quizId}`),
    enabled: useSignedIn(),
    staleTime: Infinity,
    refetchInterval: (q) => (q.state.data && ['pending', 'generating'].includes(q.state.data.status) ? 2000 : false),
  });
}

export function useStartAttempt(quizId: string) {
  return useMutation({
    // Fail at once when offline (the play screen then queues the start) instead of pausing.
    networkMode: 'always',
    // Starting with an existing id returns that attempt, which is how an attempt is resumed (FR-QUIZ-05).
    mutationFn: (body: { id: string; mode: Mode }) =>
      apiFetch<Attempt>(`/v1/quizzes/${quizId}/attempts`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (attempt) => {
      queryClient.setQueryData(['attempt', attempt.id], attempt);
      void queryClient.invalidateQueries({ queryKey: ['practice'] });
    },
  });
}

export type AnswerIn = { id: string; question_id: string; response: Response };

export function saveAnswers(attemptId: string, answers: AnswerIn[], currentIndex: number) {
  return apiFetch<Attempt>(`/v1/attempts/${attemptId}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers, current_index: currentIndex }),
  }).then((attempt) => {
    queryClient.setQueryData(['attempt', attempt.id], attempt);
    return attempt;
  });
}

export function submitAttempt(attemptId: string, answers: AnswerIn[]) {
  return apiFetch<Attempt>(`/v1/attempts/${attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }).then((attempt) => {
    queryClient.setQueryData(['attempt', attempt.id], attempt);
    void queryClient.invalidateQueries({ queryKey: ['practice'] });
    return attempt;
  });
}

/** Polls every 2 s while a submitted attempt's written answers are marked, or until the answer to
 * `waitFor` (a question id) has its feedback. */
export function useAttempt(attemptId: string, { enabled = true, waitFor }: { enabled?: boolean; waitFor?: string } = {}) {
  return useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => apiFetch<Attempt>(`/v1/attempts/${attemptId}`),
    enabled: useSignedIn() && Boolean(attemptId) && enabled,
    staleTime: Infinity,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data?.status === 'marking') return 2000;
      if (waitFor && !data?.answers.find((a) => a.question_id === waitFor)?.feedback) return 2000;
      return false;
    },
  });
}

/** The Practice tab: recent attempts and the weakest topics (FR-QUIZ-05/07). */
export function usePractice() {
  return useQuery({
    queryKey: ['practice'],
    queryFn: () => apiFetch<{ attempts: AttemptSummary[]; weak_topics: WeakTopic[] }>('/v1/practice'),
    enabled: useSignedIn(),
  });
}

// --- Marking: the same rules as the server (services/api/app/rag/questions.py) ---------------------

/** Case, accents, punctuation and extra spaces don't matter (FR-QUIZ-03). */
export function normalise(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Short answer and theory are marked by the LLM on the server, not here (FR-QUIZ-04). */
export function isWritten(question: Pick<Question, 'type'>) {
  return question.type === 'short_answer' || question.type === 'theory';
}

export function isCorrect(question: Question, response: Response): boolean {
  const { type, answer } = question;
  if (isWritten(question)) return false;
  if (type === 'mcq') return typeof response === 'number' && response === answer;
  if (type === 'true_false') return typeof response === 'boolean' && response === answer;
  if (typeof response !== 'string' || typeof answer !== 'object' || !('text' in answer)) return false;
  const accepted = [answer.text, ...(answer.alternatives ?? [])].map(normalise);
  return accepted.includes(normalise(response));
}

export function answerText(question: Question): string {
  const { type, answer, options } = question;
  if (type === 'mcq' && options && typeof answer === 'number') return options[answer];
  if (type === 'true_false') return answer ? 'True' : 'False';
  if (typeof answer === 'object') return 'text' in answer ? answer.text : answer.model_answer;
  return String(answer);
}

export function responseText(question: Question, response: Response | undefined): string {
  if (response === undefined) return 'No answer';
  if (question.type === 'mcq' && question.options && typeof response === 'number') return question.options[response] ?? '';
  if (typeof response === 'boolean') return response ? 'True' : 'False';
  return String(response);
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  true_false: 'True or false',
  fill_blank: 'Fill the blank',
  short_answer: 'Short answer',
  theory: 'Theory',
};

/** "4", "1.5": half marks at most. */
export function marksText(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
