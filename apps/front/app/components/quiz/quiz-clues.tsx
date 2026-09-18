import type {QuizGameState} from '@/lib/quiz-state';

type QuizCluesProperties = {
  game: QuizGameState;
  maxAttempts: number;
};

export function QuizClues({game, maxAttempts}: QuizCluesProperties) {
  return (
    <>
      <div className="flex gap-1.5 mb-4" role="group" aria-label="残りの手数">
        {Array.from({length: maxAttempts}, (_, index) => {
          const guess = game.guesses[index];
          const filled = guess
            ? guess.correct
              ? 'bg-brand'
              : 'bg-ink'
            : 'bg-transparent';
          return (
            <span
              key={index}
              className={`w-4 h-4 border-2 border-ink ${filled}`}
            />
          );
        })}
      </div>

      {game.hints.length > 0 && (
        <dl className="mb-5">
          {game.hints.map(hint => (
            <div
              key={hint.label}
              className="flex gap-3 py-2 border-t-2 border-ink">
              <dt className="font-mono text-[10px] text-ink-muted w-24 shrink-0 pt-0.5">
                {hint.label}
              </dt>
              <dd className="font-display font-bold text-sm leading-snug">
                {hint.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
