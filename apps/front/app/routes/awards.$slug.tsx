import type {Route} from './+types/awards.$slug';
import {AwardBody} from '@/components/editorial/award-body';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from '@/lib/awards';
import {
  awardPagePath,
  awardPageTitle,
  awardSummaryLine,
  buildAwardItemList,
  type AwardPageData,
} from '@/lib/award-page';
import {loadApiJson} from '@/lib/api';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {award, locale} = loaderData as {
    award: AwardPageData;
    locale?: Locale;
  };
  const title = awardPageTitle(award);

  return [
    ...buildSocialMeta({
      title,
      description: award.description,
      path: awardPagePath(award),
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    {'script:ld+json': buildAwardItemList(award)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const page = new URL(request.url).searchParams.get('page') ?? '1';
  const award = await loadApiJson<AwardPageData>(
    context,
    `/awards/${params.slug}?page=${encodeURIComponent(page)}`,
    {label: 'award', signal: request.signal},
  );
  return {award, locale};
}

export default function AwardDetailPage({loaderData}: Route.ComponentProps) {
  const {award} = loaderData as {award: AwardPageData};
  const locale = 'ja';
  const heading = awardHeading(award);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-mono text-[10px] text-ink-muted mb-4">
          <a href="/awards" className="text-ink-muted">
            AWARDS & LISTS
          </a>
        </nav>

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          {heading}
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-4">
          {awardSummaryLine(award)}
        </p>

        {award.grouping === 'year' && !award.subAward && (
          <a
            href={`/watched/${award.slug}`}
            className="inline-block mb-8 border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold no-underline text-ink shadow-[3px_3px_0_var(--brand)]">
            受賞作、何本観た？ →
          </a>
        )}

        <AwardBody award={award} />

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
