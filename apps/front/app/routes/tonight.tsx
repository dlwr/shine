import type {Route} from './+types/tonight';
import {AwardTaggedMovieRow} from '@/components/editorial/award-tagged-movie-row';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {NOINDEX_FOLLOW, buildSocialMeta, SITE_URL} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {TonightPickData} from '@/lib/api-types';

const RUNTIME_CHOICES = [60, 90, 120];
const DEFAULT_RUNTIME = 90;

function tonightPath(minutes: number): string {
  return minutes === DEFAULT_RUNTIME ? '/tonight' : `/tonight?m=${minutes}`;
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  return [
    ...buildSocialMeta({
      title: `今夜${loaderData.pick.maxRuntime}分の1本 | SHINE`,
      description: `映画賞・映画リストに選ばれた映画から、${loaderData.pick.maxRuntime}分以内で観られる1本を選ぶ。`,
      path: tonightPath(loaderData.pick.maxRuntime),
      locale: loaderData.locale,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    NOINDEX_FOLLOW,
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const minutes = Number(
    new URL(request.url).searchParams.get('m') ?? DEFAULT_RUNTIME,
  );
  if (!RUNTIME_CHOICES.includes(minutes)) {
    throw new Response('Not Found', {status: 404});
  }

  const pick = await loadApiJson<TonightPickData>(
    context,
    `/tonight?max=${minutes}`,
    {label: 'tonight', signal: request.signal},
  );
  return {pick, locale: getLocaleFromRequest(request)};
}

export default function TonightPage({loaderData}: Route.ComponentProps) {
  const {pick} = loaderData;
  const {movie} = pick;
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          今夜{pick.maxRuntime}分の1本
        </h1>
        <p className="font-label text-xs text-ink-muted mb-4">
          映画賞・映画リストに選ばれた{pick.maxRuntime}分以内の{pick.poolSize}
          本から
        </p>
        <nav className="flex flex-wrap gap-3 mb-8">
          {RUNTIME_CHOICES.map(minutes => (
            <a
              key={minutes}
              href={tonightPath(minutes)}
              aria-current={minutes === pick.maxRuntime ? 'page' : undefined}
              className={`font-label text-xs ${minutes === pick.maxRuntime ? 'text-ink font-bold no-underline' : 'text-ink-muted'}`}>
              {minutes}分
            </a>
          ))}
        </nav>

        <div className="border-t-[3px] border-ink">
          <AwardTaggedMovieRow
            movie={movie}
            subtitle={`${movie.year}年・${movie.runtime}分`}
            legend={pick.awards}
          />
        </div>

        <p className="border-t-2 border-ink mt-8 pt-3">
          <a
            href={tonightPath(pick.maxRuntime)}
            className="inline-block border border-ink px-3 py-1.5 font-label text-xs font-bold no-underline text-ink">
            別の1本を引く
          </a>
        </p>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
