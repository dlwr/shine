import type {ReactNode} from 'react';
import {
  AvailabilityBadges,
  buildBadges,
} from '@/components/editorial/availability-badges';
import {BigYear} from '@/components/editorial/big-year';
import {MetaLine} from '@/components/editorial/meta-line';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {WatchedToggle} from '@/components/editorial/watched-toggle';
import {useOnDemandAvailability} from '@/hooks/use-on-demand-availability';
import type {MovieDetailData} from '@/lib/movie-detail';

function formatReleaseDate(releaseDate: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseDate ?? '');
  if (!match) {
    return;
  }

  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function awardSummary(nominations: MovieDetailData['nominations']) {
  if (!nominations || nominations.length === 0) {
    return;
  }

  const organizations = [
    ...new Set(
      nominations.map(
        nomination =>
          nomination.organization.displayName ?? nomination.organization.name,
      ),
    ),
  ];
  const wins = nominations.filter(nomination => nomination.isWinner).length;
  const counts = [
    wins > 0 ? `受賞 ${wins}` : undefined,
    nominations.length > wins
      ? `ノミネート ${nominations.length - wins}`
      : undefined,
  ].filter(Boolean);

  return `${organizations.join('・')}\u{3000}${counts.join('・')}`;
}

function BillRow({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="flex gap-3 border-t border-rule py-2">
      <dt className="w-8 shrink-0 font-label text-xs leading-6 text-ink-muted">
        {label}
      </dt>
      <dd className="m-0 min-w-0 flex-1 text-sm leading-6">{children}</dd>
    </div>
  );
}

export function MovieHero({
  movieDetail,
  title,
  isMonthlyPick,
  apiUrl,
}: {
  movieDetail: MovieDetailData;
  title: string;
  isMonthlyPick: boolean;
  apiUrl: string;
}) {
  const {availability, checking} = useOnDemandAvailability({
    movieUid: movieDetail.uid,
    apiUrl,
  });

  const metaItems: string[] = [];
  if (movieDetail.imdbId) {
    metaItems.push(`IMDb ${movieDetail.imdbId}`);
  }

  if (movieDetail.originalLanguage) {
    metaItems.push(movieDetail.originalLanguage.toUpperCase());
  }

  const releaseDate = formatReleaseDate(movieDetail.releaseDate);
  const awards = awardSummary(movieDetail.nominations);

  return (
    <section className="mb-8 border-4 border-double border-rule bg-surface px-4 pt-4 pb-2">
      <div className="flex gap-4 pb-4">
        <PosterFrame
          posterUrl={movieDetail.posterUrl}
          alt={`${title} poster`}
          className="w-24 md:w-32 shrink-0"
          priority
          displaySize="w342"
        />
        <div className="flex min-w-0 flex-col justify-end gap-2">
          {movieDetail.year && (
            <a
              href={`/years/${movieDetail.year}`}
              className="no-underline text-ink">
              <BigYear
                year={movieDetail.year}
                className="text-5xl md:text-6xl"
              />
            </a>
          )}
          <h1 className="font-display font-bold text-2xl md:text-3xl break-words">
            {title}
          </h1>
          <MetaLine items={metaItems} />
          <WatchedToggle
            uid={movieDetail.uid}
            isMonthlyPick={isMonthlyPick}
            apiUrl={apiUrl}
          />
        </div>
      </div>
      <dl className="m-0">
        {releaseDate && <BillRow label="公開">{releaseDate}</BillRow>}
        {movieDetail.runtime ? (
          <BillRow label="上映">{movieDetail.runtime}分</BillRow>
        ) : undefined}
        <BillRow label="観る">
          {checking ? (
            <span className="font-label text-xs text-ink-muted">
              配信状況を確認中…
            </span>
          ) : buildBadges(availability).length > 0 ? (
            <AvailabilityBadges availability={availability} />
          ) : (
            <span className="font-label text-xs text-ink-muted">
              配信・宅配レンタルの情報なし
            </span>
          )}
        </BillRow>
        {awards && (
          <BillRow label="賞">
            <a href="#awards" className="text-ink">
              {awards}
            </a>
          </BillRow>
        )}
      </dl>
    </section>
  );
}
