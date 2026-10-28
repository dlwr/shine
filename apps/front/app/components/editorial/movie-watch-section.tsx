import {WatchMenu} from '@/components/editorial/watch-menu';
import type {Locale} from '@/lib/locale';
import type {MovieDetailData} from '@/lib/movie-detail';

export function MovieWatchSection({
  movieDetail,
  title,
  locale,
}: {
  movieDetail: MovieDetailData;
  title: string;
  locale: Locale;
}) {
  return (
    <section className="mb-8">
      <h2 className="font-label text-xs text-ink-muted mb-3">
        『{title}』を観る方法（配信・レンタル）
      </h2>
      <WatchMenu
        title={title}
        year={movieDetail.year}
        tmdbId={movieDetail.tmdbId}
        imdbUrl={movieDetail.imdbUrl}
        locale={locale}
      />
    </section>
  );
}
