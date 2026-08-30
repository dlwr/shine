import type {Route} from './+types/awards';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';
import {awardHeading} from '@/lib/awards';

export type AwardSummaryData = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list' | 'person';
  movieCount: number;
  personCount?: number;
  firstYear: number;
  lastYear: number;
};

function AwardRow({award}: {award: AwardSummaryData}) {
  return (
    <a
      href={`/awards/${award.slug}`}
      className="flex items-baseline gap-3 py-3 border-t-2 border-ink no-underline text-ink">
      <span className="flex-1">
        <span className="block font-display font-extrabold text-base md:text-lg leading-tight">
          {awardHeading(award)}
        </span>
        <span className="block font-mono text-[10px] text-ink-muted mt-1">
          {award.firstYear === award.lastYear
            ? award.firstYear
            : `${award.firstYear}–${award.lastYear}`}
        </span>
      </span>
      <span className="font-mono text-xs text-ink-muted shrink-0">
        {award.grouping === 'person'
          ? `${award.personCount} PEOPLE`
          : `${award.movieCount} FILMS`}
      </span>
    </a>
  );
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as {locale?: Locale};

  return buildSocialMeta({
    title: '映画賞・リスト一覧 | SHINE',
    description:
      'パルム・ドール、アカデミー賞作品賞、日本アカデミー賞など、SHINEに収録された映画賞と映画リストの一覧。',
    path: '/awards',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(`${apiUrl}/awards`, {signal: request.signal});
  if (!response.ok) {
    throw new Response('Failed to load awards', {status: 502});
  }

  const body = (await response.json()) as {awards: AwardSummaryData[]};
  return {awards: body.awards, locale};
}

export default function AwardsIndex({loaderData}: Route.ComponentProps) {
  const {awards} = loaderData as {awards: AwardSummaryData[]};
  const locale = 'ja';
  const filmAwards = awards.filter(award => award.grouping !== 'person');
  const personAwards = awards.filter(award => award.grouping === 'person');

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          AWARDS & LISTS
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-4">
          映画賞・映画リストから作品を探す
        </p>

        <div className="mb-8 flex flex-wrap gap-3">
          <a
            href="/crossings"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold no-underline text-ink shadow-[3px_3px_0_var(--brand)]">
            賞の交差を見る →
          </a>
          <a
            href="/uncrowned"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold no-underline text-ink shadow-[3px_3px_0_var(--brand)]">
            無冠の映画を見る →
          </a>
          <a
            href="/watched"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold no-underline text-ink shadow-[3px_3px_0_var(--brand)]">
            観た映画チェック →
          </a>
        </div>

        <div>
          {filmAwards.map(award => (
            <AwardRow key={award.slug} award={award} />
          ))}
        </div>

        {personAwards.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display font-black text-xl tracking-tight mb-2">
              PERSONAL AWARDS
            </h2>
            <p className="font-mono text-xs text-ink-muted mb-4">
              監督賞・演技賞から映画人を探す
            </p>
            <div>
              {personAwards.map(award => (
                <AwardRow key={award.slug} award={award} />
              ))}
            </div>
          </section>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
