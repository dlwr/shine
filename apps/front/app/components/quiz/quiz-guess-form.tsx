import type {QuizCandidate} from '@/lib/quiz-state';

type QuizGuessFormProperties = {
  query: string;
  remaining: number;
  suggestions: QuizCandidate[];
  pending: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (candidate?: QuizCandidate) => Promise<void>;
};

export function QuizGuessForm({
  query,
  remaining,
  suggestions,
  pending,
  onQueryChange,
  onSubmit,
}: QuizGuessFormProperties) {
  return (
    <div>
      <label
        htmlFor="quiz-guess"
        className="block font-mono text-[10px] text-ink-muted mb-1">
        邦題で回答（残り{remaining}回）
      </label>
      <input
        id="quiz-guess"
        type="text"
        value={query}
        autoComplete="off"
        placeholder="タイトルを入力"
        onChange={event => {
          onQueryChange(event.target.value);
        }}
        className="w-full border-2 border-ink bg-surface px-3 py-2 font-display text-base"
      />

      {suggestions.length > 0 && (
        <ul className="mt-2 border-2 border-ink divide-y-2 divide-ink">
          {suggestions.map(candidate => (
            <li key={candidate.uid}>
              <button
                type="button"
                disabled={pending}
                onClick={async () => onSubmit(candidate)}
                className="w-full text-left px-3 py-2 font-display font-bold text-sm bg-surface">
                {candidate.title}
                {candidate.year ? (
                  <span className="font-mono text-[10px] text-ink-muted ml-2">
                    {candidate.year}
                  </span>
                ) : undefined}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={async () => onSubmit()}
        className="mt-3 font-mono text-xs font-bold px-3 py-1.5 border-2 border-ink text-ink">
        パスしてヒントを見る
      </button>
    </div>
  );
}
