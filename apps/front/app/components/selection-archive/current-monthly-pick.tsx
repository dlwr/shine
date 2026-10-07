import {PosterFrame} from '@/components/editorial/poster-frame';
import type {SelectionHistoryItem} from '@/lib/selection-archive';
import {TAGLINE} from '@/lib/tagline';

const CURRENT_MONTHLY_LABEL = '今月みんなで観ている1本';

export function CurrentMonthlyPick({
  item,
  transformImages,
}: {
  item: SelectionHistoryItem;
  transformImages: boolean;
}) {
  const movieHref = `/movies/${item.uid}`;

  return (
    <section
      aria-labelledby="current-monthly-pick"
      className="flex gap-4 mb-8 pb-6 border-b-[4px] border-double border-rule">
      <a
        href={movieHref}
        aria-hidden="true"
        tabIndex={-1}
        className="block w-24 md:w-32 shrink-0 no-underline">
        <PosterFrame
          posterUrl={item.posterUrl}
          alt={item.title}
          displaySize="w185"
          transformImages={transformImages}
          className="w-full"
        />
      </a>
      <div className="flex min-w-0 flex-col gap-2">
        <h2
          id="current-monthly-pick"
          className="font-display text-sm font-bold text-brand">
          {CURRENT_MONTHLY_LABEL}
        </h2>
        <a
          href={movieHref}
          className="font-display font-bold text-xl md:text-2xl leading-tight text-ink no-underline">
          『{item.title}』{item.year ? `(${item.year})` : ''}
        </a>
        <p className="font-display text-sm text-ink-muted">{TAGLINE}</p>
        {(item.articleLinkCount ?? 0) > 0 && (
          <p className="font-label text-xs text-ink-muted">
            みんなの投稿 {item.articleLinkCount} 件
          </p>
        )}
        <p className="mt-1">
          <a
            href={`${movieHref}#article-links`}
            className="inline-block border border-ink bg-ink px-4 py-2 font-label text-sm font-bold text-paper no-underline">
            観たら感想・ポストのリンクを貼る
          </a>
        </p>
      </div>
    </section>
  );
}
