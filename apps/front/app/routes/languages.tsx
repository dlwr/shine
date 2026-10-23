import type {Route} from './+types/languages';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {buildSocialMeta, SITE_URL} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {LanguageSummaryData} from '@/lib/api-types';
import {languageName} from '@/lib/languages';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  return buildSocialMeta({
    title: '言語で探す映画 | SHINE',
    description: `映画賞・映画リストに選ばれた映画を、${loaderData.languages.length}の言語から探す。`,
    path: '/languages',
    locale: loaderData.locale,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const languages = await loadApiJson<LanguageSummaryData[]>(
    context,
    '/languages',
    {label: 'languages', signal: request.signal},
  );
  return {languages, locale: getLocaleFromRequest(request)};
}

export default function LanguagesPage({loaderData}: Route.ComponentProps) {
  const {languages} = loaderData;
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          言語で探す
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          映画賞・映画リストに選ばれた映画を、原語ごとに
        </p>

        <ul className="border-t-[3px] border-ink divide-y divide-rule">
          {languages.map(language => (
            <li key={language.code}>
              <a
                href={`/languages/${language.code}`}
                className="flex items-baseline justify-between gap-4 py-2.5 no-underline text-ink">
                <span className="font-display font-bold text-base">
                  {languageName(language.code)}
                </span>
                <span className="font-label text-xs text-ink-muted tabular-nums">
                  {language.movieCount} 本
                </span>
              </a>
            </li>
          ))}
        </ul>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
