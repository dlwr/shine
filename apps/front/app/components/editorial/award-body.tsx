import {AwardMovieRow} from '@/components/editorial/award-movie-row';
import {PersonAwardYearSection} from '@/components/editorial/person-award-years';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {
  AwardDetailData,
  AwardMovieEntryData,
  AwardPageData,
  AwardPaginationData,
  AwardYearGroupData,
} from '@/lib/award-page';

function ListRow({movie}: {movie: AwardMovieEntryData}) {
  const title = movie.title ?? 'Unknown Title';

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-3 py-2 border-t-2 border-ink no-underline text-ink">
      <PosterFrame
        posterUrl={movie.posterUrl}
        alt={`${title} poster`}
        className="w-9 shrink-0"
        displaySize="w185"
      />
      <span className="flex-1 font-display font-extrabold text-sm leading-none">
        {title}
      </span>
      {movie.movieYear && (
        <span className="font-mono text-xs text-ink-muted shrink-0">
          {movie.movieYear}
        </span>
      )}
    </a>
  );
}

function YearSection({
  award,
  group,
}: {
  award: AwardDetailData;
  group: AwardYearGroupData;
}) {
  const yearHref = `/awards/${award.slug}/${group.year}`;

  return (
    <section>
      <div className="flex items-baseline gap-3 border-t-[3px] border-ink pt-2 mb-2">
        <h2 className="font-display font-black text-3xl md:text-4xl tracking-[-0.06em] leading-none">
          <a href={yearHref} className="text-ink no-underline">
            {group.year}
          </a>
        </h2>
        {group.ceremonyNumber && (
          <span className="font-mono text-[10px] text-ink-muted">
            第{group.ceremonyNumber}回
          </span>
        )}
        {group.filmCount > group.movies.length && (
          <a
            href={yearHref}
            className="ml-auto font-mono text-[10px] text-ink-muted no-underline shrink-0">
            出品作{group.filmCount}本を見る →
          </a>
        )}
      </div>
      <div>
        {group.movies.length > 0 ? (
          group.movies.map(movie => (
            <AwardMovieRow key={movie.uid} movie={movie} />
          ))
        ) : (
          <p className="font-mono text-xs text-ink-muted py-3">受賞作なし</p>
        )}
      </div>
    </section>
  );
}

function Pagination({
  award,
  pagination,
}: {
  award: AwardDetailData;
  pagination: AwardPaginationData;
}) {
  if (pagination.totalPages <= 1) {
    return;
  }

  const pageHref = (page: number) =>
    page === 1 ? `/awards/${award.slug}` : `/awards/${award.slug}?page=${page}`;

  return (
    <nav className="flex items-center justify-between gap-4 border-t-2 border-ink pt-4 mt-6 font-mono text-xs">
      {pagination.page > 1 ? (
        <a href={pageHref(pagination.page - 1)} className="text-ink">
          ← 前の{pagination.perPage}件
        </a>
      ) : (
        <span />
      )}
      <span className="text-ink-muted">
        {pagination.page} / {pagination.totalPages}
      </span>
      {pagination.page < pagination.totalPages ? (
        <a href={pageHref(pagination.page + 1)} className="text-ink">
          次の{pagination.perPage}件 →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function AwardBody({award}: {award: AwardPageData}) {
  if (award.grouping === 'person') {
    return (
      <div className="space-y-10">
        {award.years.map(group => (
          <PersonAwardYearSection key={group.year} group={group} />
        ))}
      </div>
    );
  }

  if (award.grouping === 'year') {
    return (
      <div className="space-y-10">
        {award.years.map(group => (
          <YearSection key={group.year} award={award} group={group} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {award.years.flatMap(group =>
        group.movies.map(movie => <ListRow key={movie.uid} movie={movie} />),
      )}
      {award.pagination && (
        <Pagination award={award} pagination={award.pagination} />
      )}
    </div>
  );
}
