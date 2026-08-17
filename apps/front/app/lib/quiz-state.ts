export type QuizHint = {label: string; value: string};

export type QuizCandidate = {uid: string; title: string; year?: number};

export type QuizAnswer = {
  uid: string;
  title: string;
  year?: number;
};

export type QuizGuess = {
  title?: string;
  correct: boolean;
};

export type QuizGameState = {
  date: string;
  guesses: QuizGuess[];
  hints: QuizHint[];
  answer?: QuizAnswer;
  status: 'playing' | 'won' | 'lost';
};

export type QuizHistory = Record<string, {attempts: number; won: boolean}>;

export const QUIZ_STATE_KEY = 'shine-quiz-v1';
export const QUIZ_HISTORY_KEY = 'shine-quiz-history-v1';

export function createGame(date: string): QuizGameState {
  return {date, guesses: [], hints: [], status: 'playing'};
}

export function applyGuess(
  state: QuizGameState,
  guess: QuizGuess,
  result: {hint?: QuizHint; answer?: QuizAnswer},
  maxAttempts: number,
): QuizGameState {
  const guesses = [...state.guesses, guess];
  const hints = result.hint ? [...state.hints, result.hint] : state.hints;

  if (guess.correct) {
    return {...state, guesses, hints, answer: result.answer, status: 'won'};
  }

  if (guesses.length >= maxAttempts) {
    return {...state, guesses, hints, answer: result.answer, status: 'lost'};
  }

  return {...state, guesses, hints};
}

const NOISE_PATTERN = /[\s・：:,、。！!?？'"’”/／]/g;

function normalize(value: string): string {
  return value.toLowerCase().replaceAll(NOISE_PATTERN, '');
}

export function filterCandidates(
  candidates: QuizCandidate[],
  query: string,
  limit: number,
): QuizCandidate[] {
  const needle = normalize(query);
  if (needle.length === 0) {
    return [];
  }

  return candidates
    .filter(candidate => normalize(candidate.title).includes(needle))
    .slice(0, limit);
}

const MARKS = {
  correct: '🟩',
  wrong: '🟥',
  passed: '⬛',
  unused: '⬜',
};

export function shareText(state: QuizGameState, maxAttempts: number): string {
  const marks = state.guesses.map(guess => {
    if (guess.correct) {
      return MARKS.correct;
    }

    return guess.title ? MARKS.wrong : MARKS.passed;
  });
  const padding = MARKS.unused.repeat(Math.max(maxAttempts - marks.length, 0));
  const score =
    state.status === 'won' ? `${state.guesses.length}/${maxAttempts}` : 'X';

  return [
    `SHINE QUIZ ${state.date} ${score}`,
    marks.join('') + padding,
    `https://shine-film.com/quiz?d=${state.date}`,
  ].join('\n');
}

export function recordResult(
  history: QuizHistory,
  state: QuizGameState,
): QuizHistory {
  if (state.status === 'playing') {
    return history;
  }

  return {
    ...history,
    [state.date]: {
      attempts: state.guesses.length,
      won: state.status === 'won',
    },
  };
}

function previousDate(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  return new Date(time - 86_400_000).toISOString().slice(0, 10);
}

export function streakOf(history: QuizHistory, date: string): number {
  let streak = 0;
  let cursor = date;

  while (history[cursor]?.won) {
    streak++;
    cursor = previousDate(cursor);
  }

  return streak;
}
