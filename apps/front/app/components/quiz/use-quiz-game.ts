import {useEffect, useMemo, useState} from 'react';
import {
  applyGuess,
  createGame,
  filterCandidates,
  QUIZ_HISTORY_KEY,
  QUIZ_STATE_KEY,
  recordResult,
  type QuizAnswer,
  type QuizCandidate,
  type QuizGameState,
  type QuizHint,
  type QuizHistory,
} from '@/lib/quiz-state';

const SUGGESTION_LIMIT = 8;

export type QuizPuzzle = {date: string; maxAttempts: number; poolSize: number};

function readStorage<T>(key: string): T | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // プライベートモードなどでは保存できないが、その日のプレイは続けられる
  }
}

export function useQuizGame(puzzle: QuizPuzzle, apiUrl: string) {
  const [candidates, setCandidates] = useState<QuizCandidate[]>([]);
  const [game, setGame] = useState<QuizGameState>(() =>
    createGame(puzzle.date),
  );
  const [history, setHistory] = useState<QuizHistory>({});
  const [restored, setRestored] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/quiz/candidates`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as {candidates?: QuizCandidate[]};
        setCandidates(body.candidates ?? []);
      } catch {
        // 候補が取れなくてもパスでヒントは進められる
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiUrl]);

  useEffect(() => {
    const saved = readStorage<QuizGameState>(QUIZ_STATE_KEY);
    if (saved?.date === puzzle.date) {
      setGame(saved);
    }

    setHistory(readStorage<QuizHistory>(QUIZ_HISTORY_KEY) ?? {});
    setRestored(true);
  }, [puzzle.date]);

  useEffect(() => {
    if (restored) {
      writeStorage(QUIZ_STATE_KEY, game);
    }
  }, [game, restored]);

  const suggestions = useMemo(
    () => filterCandidates(candidates, query, SUGGESTION_LIMIT),
    [candidates, query],
  );

  const isFinished = game.status !== 'playing';

  async function submit(candidate?: QuizCandidate) {
    if (pending || isFinished) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`${apiUrl}/quiz/guess`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          date: puzzle.date,
          movieUid: candidate?.uid,
          attempt: game.guesses.length + 1,
        }),
      });
      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as {
        correct: boolean;
        hint?: QuizHint;
        answer?: QuizAnswer;
      };
      const next = applyGuess(
        game,
        {title: candidate?.title, correct: result.correct},
        result,
        puzzle.maxAttempts,
      );

      setGame(next);
      setQuery('');
      if (next.status !== 'playing') {
        const updated = recordResult(history, next);
        setHistory(updated);
        writeStorage(QUIZ_HISTORY_KEY, updated);
      }
    } finally {
      setPending(false);
    }
  }

  return {
    game,
    history,
    isFinished,
    query,
    setQuery,
    pending,
    suggestions,
    submit,
  };
}
