import type {MonthlyPick} from '@/lib/monthly-pick';
import {posterUrlForDisplay} from '@/lib/poster-size';

const COPY = {
  ja: {
    label: '今月の1本',
    cta: 'みんなで観る →',
    ownLabel: 'この映画が今月の1本',
    ownCta: '観たら記事・ポストを貼る →',
  },
  en: {
    label: 'THIS MONTH',
    cta: 'Watch together →',
    ownLabel: "THIS MONTH'S FILM",
    ownCta: 'Add your post →',
  },
} as const;

export function MonthlyBand({
  monthly,
  locale = 'ja',
  currentPath,
}: {
  monthly: MonthlyPick | undefined;
  locale?: string;
  currentPath: string;
}) {
  if (!monthly) {
    return;
  }

  const copy = COPY[locale as keyof typeof COPY] ?? COPY.ja;
  const movieHref = `/movies/${monthly.uid}`;
  const isOwnPage = currentPath === movieHref;
  const href = isOwnPage ? '#article-links' : movieHref;
  const posterSource = posterUrlForDisplay(monthly.posterUrl, 'w185');

  return (
    <aside className="border-b-2 border-ink bg-surface">
      <a
        href={href}
        className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2 no-underline text-ink">
        {posterSource && (
          <img
            src={posterSource}
            alt=""
            width={28}
            height={40}
            className="h-10 w-7 shrink-0 border border-ink object-cover"
          />
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block font-mono text-[10px] font-bold uppercase text-brand">
            {isOwnPage ? copy.ownLabel : copy.label}
          </span>
          <span className="line-clamp-2 font-display text-sm font-bold">
            {monthly.title}
            {monthly.year && (
              <span className="ml-1.5 font-mono text-[10px] font-normal text-ink-muted">
                {monthly.year}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] font-bold text-ink-muted">
          {isOwnPage ? copy.ownCta : copy.cta}
        </span>
      </a>
    </aside>
  );
}
