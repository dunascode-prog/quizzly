import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type Mode = 'practice' | 'exam';

export type Question = {
  id: string;
  ordinal: number;
  type: QuestionType;
  difficulty: string;
  stem: string;
  options: string[] | null;
  answer: number | boolean | { text: string; alternatives: string[] };
  explanation: string;
  source_pages: number[];
  topic_id: string | null;
  topic_title: string | null;
  marks: number;
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
  questions: Question[];
};

export type Response = number | boolean | string;

export type TopicResult = { topic_id: string; title: string | null; score: number; max: number };

export type Attempt = {
  id: string;
  quiz_id: string;
  title: string;
  mode: Mode;
  status: 'in_progress' | 'submitted' | 'marking' | 'completed';
  started_at: string;
  submitted_at: string | null;
  current_index: number;
  score: number | null;
  max_score: number | null;
  topics: TopicResult[];
  weakest: TopicResult[];
  answers: { question_id: string; response: Response; is_correct: boolean | null }[];
};

export type QuizSettings = {
  topic_ids: string[];
  types: QuestionType[];
  difficulty: Difficulty;
  count: 5 | 10 | 20 | 30;
  mode: Mode;
  new_questions?: boolean;
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
    mutationFn: (body: { id: string; mode: Mode }) =>
      apiFetch<Attempt>(`/v1/quizzes/${quizId}/attempts`, { method: 'POST', body: JSON.stringify(body) }),
  });
}

export type AnswerIn = { id: string; question_id: string; response: Response };

export function saveAnswers(attemptId: string, answers: AnswerIn[], currentIndex: number) {
  return apiFetch<Attempt>(`/v1/attempts/${attemptId}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers, current_index: currentIndex }),
  });
}

export function submitAttempt(attemptId: string, answers: AnswerIn[]) {
  return apiFetch<Attempt>(`/v1/attempts/${attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }).then((attempt) => {
    queryClient.setQueryData(['attempt', attempt.id], attempt);
    return attempt;
  });
}

export function useAttempt(attemptId: string) {
  return useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => apiFetch<Attempt>(`/v1/attempts/${attemptId}`),
    enabled: useSignedIn() && Boolean(attemptId),
    staleTime: Infinity,
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

export function isCorrect(question: Question, response: Response): boolean {
  const { type, answer } = question;
  if (type === 'mcq') return typeof response === 'number' && response === answer;
  if (type === 'true_false') return typeof response === 'boolean' && response === answer;
  if (typeof response !== 'string' || typeof answer !== 'object') return false;
  const accepted = [answer.text, ...(answer.alternatives ?? [])].map(normalise);
  return accepted.includes(normalise(response));
}

export function answerText(question: Question): string {
  const { type, answer, options } = question;
  if (type === 'mcq' && options && typeof answer === 'number') return options[answer];
  if (type === 'true_false') return answer ? 'True' : 'False';
  return typeof answer === 'object' ? answer.text : String(answer);
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
};
