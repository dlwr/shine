import type {Route} from './+types/on-this-day';
import {AwardTags} from '@/components/editorial/award-tags';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {NOINDEX_FOLLOW, buildSocialMeta, SITE_URL} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {OnThisDayData} from '@/lib/api-types';
import {
  formatMonthDay,
  isMonthDay,
  monthDayInJapan,
  shiftMonthDay,
  yearInJapan,
} from '@/lib/on-this-day';

type OnThisDayMovieData = OnThisDayData['movies'][number];

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {detail, locale} = loaderData;
  const day = formatMonthDay(detail.monthDay);

  return [
    ...buildSocialMeta({
      title: `${day}に初公開された映画 | SHINE`,
      description: `${day}に初公開された、映画賞・映画リストに選ばれた映画${detail.movies.length}本。`,
      path: `/on-this-day?d=${detail.monthDay}`,
      locale,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    NOINDEX_FOLLOW,
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const now = new Date();
  const monthDay =
    new URL(request.url).searchParams.get('d') ?? monthDayInJapan(now);
  if (!isMonthDay(monthDay)) {
    throw new Response('Not Found', {status: 404});
  }

  const detail = await loadApiJson<OnThisDayData>(
    context,
    `/on-this-day/${monthDay}`,
    {label: 'on this day', signal: request.signal},
  );
  return {
    detail,
    locale: getLocaleFromRequest(request),
    currentYear: yearInJapan(now),
  };
}

function MovieRow({
  movie,
  awards,
  currentYear,
}: {
  movie: OnThisDayMovieData;
  awards: OnThisDayData['awards'];
  currentYear: number;
}) {
  const title = movie.title ?? 'Unknown Title';
  const year = Number(movie.releaseDate.slice(0, 4));

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
        <span className="font-label text-xs text-ink-muted">
          {`${year}年・公開から${currentYear - year}年`}
        </span>
        <AwardTags tags={movie.awards} legend={awards} />
      </span>
    </a>
  );
}

function DayLink({monthDay, label}: {monthDay: string; label: string}) {
  return (
    <a
      href={`/on-this-day?d=${monthDay}`}
      className="font-label text-xs text-ink-muted no-underline">
      {label}
    </a>
  );
}

export default function OnThisDayPage({loaderData}: Route.ComponentProps) {
  const {detail, currentYear} = loaderData;
  const locale = 'ja';
  const previous = shiftMonthDay(detail.monthDay, -1);
  const next = shiftMonthDay(detail.monthDay, 1);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          {formatMonthDay(detail.monthDay)}に初公開された映画
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          {detail.movies.length} 本
        </p>

        {detail.movies.length === 0 ? (
          <p className="font-label text-sm text-ink-muted border-t-[3px] border-ink pt-4">
            この日に初公開された映画はまだありません。
          </p>
        ) : (
          <div className="border-t-[3px] border-ink divide-y divide-rule">
            {detail.movies.map(movie => (
              <MovieRow
                key={movie.uid}
                movie={movie}
                awards={detail.awards}
                currentYear={currentYear}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t-2 border-ink mt-8 pt-3">
          <DayLink
            monthDay={previous}
            label={`← ${formatMonthDay(previous)}`}
          />
          <DayLink monthDay={next} label={`${formatMonthDay(next)} →`} />
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
