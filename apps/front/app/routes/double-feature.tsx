import type {Route} from './+types/double-feature';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {NOINDEX_FOLLOW, buildSocialMeta, SITE_URL} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {DoubleFeatureData} from '@/lib/api-types';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  return [
    ...buildSocialMeta({
      title: '今日の二本立て | SHINE',
      description: `監督・出演者・賞でつながる2本を毎日組む。${loaderData.feature.connection.label}。`,
      path: '/double-feature',
      locale: loaderData.locale,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    NOINDEX_FOLLOW,
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const feature = await loadApiJson<DoubleFeatureData>(
    context,
    '/double-feature',
    {label: 'double-feature', signal: request.signal},
  );
  return {feature, locale: getLocaleFromRequest(request)};
}

export default function DoubleFeaturePage({loaderData}: Route.ComponentProps) {
  const {feature} = loaderData;
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          今日の二本立て
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          {feature.date.replaceAll('-', '.')} の番組
        </p>

        <div className="border-t-[3px] border-ink pt-4">
          <p className="font-display font-bold text-lg md:text-xl mb-6">
            {feature.connection.label}
          </p>
          <div className="grid grid-cols-2 gap-4 md:gap-8 max-w-xl">
            {feature.movies.map((movie, index) => (
              <a
                key={movie.uid}
                href={`/movies/${movie.uid}`}
                className="block min-w-0 no-underline text-ink">
                <PosterFrame
                  posterUrl={movie.posterUrl}
                  alt={`${movie.title} poster`}
                  className="w-full"
                  displaySize="w342"
                  priority={index === 0}
                />
                <span className="block font-display font-bold text-base leading-tight mt-3 break-words">
                  {movie.title}
                </span>
                {movie.year && (
                  <span className="block font-label text-xs text-ink-muted mt-1">
                    {movie.year}年
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
