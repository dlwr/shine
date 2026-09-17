import {useState} from 'react';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {MonthlyPick} from '@/lib/monthly-pick';
import {shareText, type QuizGameState} from '@/lib/quiz-state';
import {TAGLINE} from '@/lib/tagline';

function buildShareUrls(text: string): {x: string; bluesky: string} {
  const encoded = encodeURIComponent(text);

  return {
    x: `https://x.com/intent/post?text=${encoded}`,
    bluesky: `https://bsky.app/intent/compose?text=${encoded}`,
  };
}

type QuizResultProperties = {
  game: QuizGameState;
  maxAttempts: number;
  monthly: MonthlyPick | undefined;
};

export function QuizResult({game, maxAttempts, monthly}: QuizResultProperties) {
  const [copied, setCopied] = useState(false);
  const text = shareText(game, maxAttempts);
  const shareUrls = buildShareUrls(text);

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-2 border-ink p-4 md:col-start-2 md:row-start-1">
      <p className="font-display font-black text-lg mb-1">
        {game.status === 'won' ? '正解！' : '残念！'}
      </p>
      <p className="font-display font-bold text-base leading-snug">
        {game.answer ? (
          <a href={`/movies/${game.answer.uid}`} className="text-ink underline">
            {game.answer.title}
          </a>
        ) : (
          '—'
        )}
        {game.answer?.year ? (
          <span className="font-mono text-xs text-ink-muted ml-2">
            {game.answer.year}
          </span>
        ) : undefined}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyShareText}
          className="font-mono text-xs font-bold bg-brand text-brand-on px-3 py-1.5 border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
          {copied ? 'コピーしました' : '結果をコピー'}
        </button>
        <a
          href={shareUrls.x}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs font-bold px-3 py-1.5 border-2 border-ink text-ink hover:bg-ink hover:text-surface transition-colors">
          X に投稿
        </a>
        <a
          href={shareUrls.bluesky}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs font-bold px-3 py-1.5 border-2 border-ink text-ink hover:bg-ink hover:text-surface transition-colors">
          Bluesky に投稿
        </a>
      </div>
      {monthly && (
        <a
          href={`/movies/${monthly.uid}`}
          className="mt-4 flex gap-3 border-2 border-ink bg-paper p-3 text-ink shadow-[3px_3px_0_var(--ink)] hover:bg-ink hover:text-paper transition-colors">
          <PosterFrame
            posterUrl={monthly.posterUrl}
            alt={monthly.title}
            displaySize="w185"
            className="w-16 shrink-0"
          />
          <span className="min-w-0 flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold tracking-widest">
              MONTHLY / 今月の1本
            </span>
            <span className="font-display font-black text-base leading-snug">
              {monthly.title}
              <span className="font-mono text-xs font-normal ml-2">
                {monthly.year}
              </span>
            </span>
            <span className="font-mono text-[10px]">{TAGLINE}</span>
            <span className="mt-1 self-start font-mono text-xs font-bold bg-brand text-brand-on px-3 py-1 border-2 border-ink">
              映画ページへ →
            </span>
          </span>
        </a>
      )}
      <p className="font-mono text-[10px] text-ink-muted mt-3">
        次の問題は明日9時に出ます
      </p>
    </div>
  );
}
