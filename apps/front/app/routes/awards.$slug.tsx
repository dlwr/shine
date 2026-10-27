import type {Route} from './+types/awards.$slug';
import {AvailabilitySummaryLine} from '@/components/editorial/availability-summary-line';
import {AwardBody} from '@/components/editorial/award-body';
import {FirstPickSection} from '@/components/editorial/first-pick-section';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from '@/lib/awards';
import {
  awardLeadText,
  awardPagePath,
  awardPageTitle,
  awardSummaryLine,
  buildAwardItemList,
  type AwardPageData,
} from '@/lib/award-page';
import {loadApiJson, tryApiJson} from '@/lib/api';
import type {AwardsListData} from '@/lib/api-types';
import {nextAwards, type NextAwards} from '@/lib/next-awards';
import {NextAwardsSection} from '@/components/editorial/next-awards-section';
import {awardFirstPick} from '@/lib/first-pick';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {award, locale} = loaderData as {
    award: AwardPageData;
    locale?: Locale;
  };
  const title = awardPageTitle(award);

  return [
    ...buildSocialMeta({
      title,
      description: [award.description, awardLeadText(award)]
        .filter(Boolean)
        .join(''),
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
  const [award, list] = await Promise.all([
    loadApiJson<AwardPageData>(
      context,
      `/awards/${params.slug}?page=${encodeURIComponent(page)}`,
      {label: 'award', signal: request.signal},
    ),
    tryApiJson<AwardsListData>(context, '/awards', {signal: request.signal}),
  ]);
  return {
    award,
    locale,
    nextAwards: nextAwards(params.slug, list?.awards ?? []),
  };
}

export default function AwardDetailPage({loaderData}: Route.ComponentProps) {
  const {award, nextAwards: next} = loaderData as {
    award: AwardPageData;
    nextAwards?: NextAwards;
  };
  const locale = 'ja';
  const heading = awardHeading(award);
  const leadText = awardLeadText(award);
  const firstPick =
    award.grouping === 'person' ? undefined : awardFirstPick(award);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-label text-[10px] text-ink-muted mb-4">
          <a href="/awards" className="text-ink-muted">
            映画賞・リスト
          </a>
        </nav>

        <h1 className="font-display font-bold text-2xl md:text-3xl mb-2">
          {heading}
        </h1>
        <p className="font-label text-xs text-ink-muted mb-4">
          {awardSummaryLine(award)}
        </p>
        {leadText && <p className="mb-4 text-sm leading-relaxed">{leadText}</p>}
        {award.grouping !== 'person' && (
          <AvailabilitySummaryLine
            summary={award.availabilitySummary}
            unavailableHref={`/awards/${award.slug}/unavailable`}
            className="mb-4"
          />
        )}

        {award.grouping === 'year' && !award.subAward && (
          <a
            href={`/watched/${award.slug}`}
            className="inline-block mb-8 border border-ink px-3 py-1.5 font-label text-xs font-bold no-underline text-ink">
            受賞作、何本観た？
          </a>
        )}

        {firstPick && <FirstPickSection pick={firstPick} />}

        <AwardBody award={award} />

        {next && <NextAwardsSection next={next} />}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
