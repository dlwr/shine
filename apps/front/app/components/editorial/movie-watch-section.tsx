import {AvailabilityBadges} from '@/components/editorial/availability-badges';
import {WatchMenu} from '@/components/editorial/watch-menu';
import {useOnDemandAvailability} from '@/hooks/use-on-demand-availability';
import type {Locale} from '@/lib/locale';
import type {MovieDetailData} from '@/lib/movie-detail';

export function MovieWatchSection({
  movieDetail,
  title,
  apiUrl,
  locale,
}: {
  movieDetail: MovieDetailData;
  title: string;
  apiUrl: string;
  locale: Locale;
}) {
  const {availability, checking} = useOnDemandAvailability({
    movieUid: movieDetail.uid,
    apiUrl,
    initial: movieDetail.availability,
  });

  return (
    <section className="mb-8">
      <p className="font-mono text-xs text-ink-muted mb-3">WATCH</p>
      {checking ? (
        <p className="font-mono text-xs text-ink-muted mb-3">
          配信状況を確認中…
        </p>
      ) : (
        <AvailabilityBadges availability={availability} className="mb-3" />
      )}
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
