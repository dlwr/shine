import type {Route} from './+types/languages.$code';
import {AwardTaggedMovieRow} from '@/components/editorial/award-tagged-movie-row';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {NOINDEX_FOLLOW, buildSocialMeta, SITE_URL} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {LanguagePageData} from '@/lib/api-types';
import {languageName} from '@/lib/languages';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {detail, locale} = loaderData;
  const name = languageName(detail.code);

  return [
    ...buildSocialMeta({
      title: `${name}の映画 | SHINE`,
      description: `映画賞・映画リストに選ばれた${name}の映画${detail.movieCount}本。`,
      path: `/languages/${detail.code}`,
      locale,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    NOINDEX_FOLLOW,
  ];
}

export async function loader({context, params, request}: Route.LoaderArgs) {
  const page = new URL(request.url).searchParams.get('page') ?? '1';
  const detail = await loadApiJson<LanguagePageData>(
    context,
    `/languages/${encodeURIComponent(params.code)}?page=${encodeURIComponent(page)}`,
    {label: 'language', signal: request.signal},
  );
  return {detail, locale: getLocaleFromRequest(request)};
}

function PageLink({
  code,
  page,
  label,
}: {
  code: string;
  page: number;
  label: string;
}) {
  return (
    <a
      href={
        page === 1 ? `/languages/${code}` : `/languages/${code}?page=${page}`
      }
      className="font-label text-xs text-ink-muted no-underline">
      {label}
    </a>
  );
}

export default function LanguagePage({loaderData}: Route.ComponentProps) {
  const {detail} = loaderData;
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          {languageName(detail.code)}の映画
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          {detail.movieCount} 本
          {detail.pageCount > 1 &&
            `・${detail.page} / ${detail.pageCount} ページ`}
        </p>

        <div className="border-t-[3px] border-ink divide-y divide-rule">
          {detail.movies.map(movie => (
            <AwardTaggedMovieRow
              key={movie.uid}
              movie={movie}
              subtitle={movie.year ? `${movie.year}年` : ''}
              legend={detail.awards}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t-2 border-ink mt-8 pt-3">
          {detail.page > 1 ? (
            <PageLink code={detail.code} page={detail.page - 1} label="← 前" />
          ) : (
            <a
              href="/languages"
              className="font-label text-xs text-ink-muted no-underline">
              言語の一覧
            </a>
          )}
          {detail.page < detail.pageCount && (
            <PageLink code={detail.code} page={detail.page + 1} label="次 →" />
          )}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
