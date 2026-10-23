import {
  AwardTags,
  type AwardTag,
  type AwardTagLegend,
} from '@/components/editorial/award-tags';
import {PosterFrame} from '@/components/editorial/poster-frame';

export function AwardTaggedMovieRow({
  movie,
  subtitle,
  legend,
}: {
  movie: {uid: string; title?: string; posterUrl?: string; awards: AwardTag[]};
  subtitle: string;
  legend: AwardTagLegend[];
}) {
  const title = movie.title ?? 'Unknown Title';

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-4 py-3 no-underline text-ink">
      <PosterFrame
        posterUrl={movie.posterUrl}
        alt={`${title} poster`}
        className="w-16 shrink-0"
        displaySize="w185"
      />
      <span className="flex-1 min-w-0 flex flex-col gap-1.5">
        <span className="font-display font-extrabold text-base md:text-lg leading-tight">
          {title}
        </span>
        <span className="font-label text-xs text-ink-muted">{subtitle}</span>
        <AwardTags tags={movie.awards} legend={legend} />
      </span>
    </a>
  );
}
