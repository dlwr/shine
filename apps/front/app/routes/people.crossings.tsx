import type {Route} from './+types/people.crossings';
import {CrossingMatrix} from '@/components/editorial/crossing-matrix';
import {Masthead} from '@/components/editorial/masthead';
import {PersonPortrait} from '@/components/editorial/person-portrait';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';

type Organization = {
  key: string;
  name: string;
  shortLabel: string;
  performanceCount: number;
};

type Performance = {
  person: {uid: string; name: string; profilePath?: string};
  movie: {uid: string; title?: string; year?: number; posterUrl?: string};
  awards: Array<{slug: string; organization: string; category: string}>;
  organizationCount: number;
};

type PersonCrossingsData = {
  organizations: Organization[];
  pairs: Array<{a: string; b: string; shared: number}>;
  distribution: Array<{organizationCount: number; performanceCount: number}>;
  topPerformances: Performance[];
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as {locale?: Locale};

  return buildSocialMeta({
    title: '映画人の交差 | SHINE',
    description:
      '映画賞の監督賞・演技賞が、同じ演技・演出をどれだけ選んでいるか。最も多くの団体に選ばれた演技・演出と、団体同士の重なりの一覧。',
    path: '/people/crossings',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(`${apiUrl}/people/crossings?locale=${locale}`, {
    signal: request.signal,
  });
  if (!response.ok) {
    throw new Response('Failed to load people crossings', {status: 502});
  }

  const body = (await response.json()) as PersonCrossingsData;
  return {...body, locale};
}

function PerformanceRow({
  performance,
  shortLabels,
  showCount,
}: {
  performance: Performance;
  shortLabels: Map<string, string>;
  showCount?: boolean;
}) {
  const {person, movie, awards} = performance;

  return (
    <li className="flex items-start gap-3 border-t border-ink/20 py-3">
      <PersonPortrait
        name={person.name}
        profilePath={person.profilePath}
        className="w-12 shrink-0 md:w-14"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          {showCount && (
            <span className="font-display text-sm font-black text-brand">
              {performance.organizationCount}
            </span>
          )}
          <a
            href={`/people/${person.uid}`}
            className="font-display text-base font-extrabold leading-tight text-ink no-underline">
            {person.name}
          </a>
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
          <a
            href={`/movies/${movie.uid}`}
            className="border-b border-ink-muted text-ink no-underline">
            {movie.title ?? 'タイトル不明'}
          </a>
          {movie.year ? ` ${movie.year}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {awards.map(award => (
            <a
              key={award.slug}
              href={`/awards/${award.slug}`}
              className="border border-ink-muted px-1 py-0.5 font-mono text-[10px] text-ink-muted no-underline">
              {`${shortLabels.get(award.organization) ?? award.organization} ${award.category}`}
            </a>
          ))}
        </div>
      </div>
    </li>
  );
}

export default function PeopleCrossings({loaderData}: Route.ComponentProps) {
  const {organizations, pairs, distribution, topPerformances, locale} =
    loaderData as PersonCrossingsData & {locale: Locale};
  const shortLabels = new Map(
    organizations.map(organization => [
      organization.name,
      organization.shortLabel,
    ]),
  );
  const maxOrganizationCount = topPerformances[0]?.organizationCount ?? 0;
  const leaders = topPerformances.filter(
    performance => performance.organizationCount === maxOrganizationCount,
  );
  const rest = topPerformances.slice(leaders.length);
  const maxPerformanceCount = Math.max(
    ...distribution.map(entry => entry.performanceCount),
    1,
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="mb-2 font-display text-2xl font-black tracking-tight md:text-3xl">
          PEOPLE CROSSINGS
        </h1>
        <p className="mb-8 font-mono text-xs text-ink-muted">
          {organizations.length}
          の映画賞の監督賞・演技賞が、同じ演技・演出をどれだけ選んでいるか
        </p>

        {leaders.length > 0 && (
          <section className="mb-10 border-2 border-ink p-4 shadow-[6px_6px_0_var(--brand)]">
            <p className="mb-3 font-mono text-xs text-ink-muted">
              最も多くの団体に選ばれた演技・演出
            </p>
            <div className="mb-3 flex items-baseline gap-3">
              <p className="font-display text-5xl leading-none font-black text-brand">
                {`${maxOrganizationCount}冠`}
              </p>
              <p className="font-mono text-xs text-ink-muted">
                {leaders.length}件
              </p>
            </div>
            <ul className="list-none p-0 md:grid md:grid-cols-2 md:gap-x-6">
              {leaders.map(performance => (
                <PerformanceRow
                  key={`${performance.person.uid}:${performance.movie.uid}`}
                  performance={performance}
                  shortLabels={shortLabels}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="mb-10">
          <p className="mb-3 font-mono text-xs text-ink-muted">
            いくつの団体に選ばれたか
          </p>
          <ul>
            {distribution.map(entry => (
              <li
                key={entry.organizationCount}
                className="flex items-center gap-3 border-t border-ink/20 py-1.5">
                <span className="w-16 shrink-0 font-mono text-xs text-ink-muted">
                  {entry.organizationCount}冠
                </span>
                <span
                  className="h-3 bg-ink"
                  style={{
                    width: `${Math.max(
                      2,
                      (Math.log10(entry.performanceCount + 1) /
                        Math.log10(maxPerformanceCount + 1)) *
                        100,
                    )}%`,
                  }}
                />
                <span className="font-mono text-xs">
                  {entry.performanceCount.toLocaleString('en-US')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <p className="mb-3 font-mono text-xs text-ink-muted">
            団体と団体の重なり（両方に選ばれた演技・演出の数）
          </p>
          <CrossingMatrix
            awards={organizations.map(organization => ({
              key: organization.key,
              shortLabel: organization.shortLabel,
              name: organization.name,
              count: organization.performanceCount,
            }))}
            pairs={pairs}
            unit="件"
          />
        </section>

        {rest.length > 0 && (
          <section className="mb-10">
            <p className="mb-3 font-mono text-xs text-ink-muted">
              多くの団体に選ばれた演技・演出
            </p>
            <ul className="list-none border-b border-ink/20 p-0 md:grid md:grid-cols-2 md:gap-x-6">
              {rest.map(performance => (
                <PerformanceRow
                  key={`${performance.person.uid}:${performance.movie.uid}`}
                  performance={performance}
                  shortLabels={shortLabels}
                  showCount
                />
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <a
            href="/people"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold text-ink no-underline shadow-[3px_3px_0_var(--ink)]">
            映画人ランキング
          </a>
          <a
            href="/crossings"
            className="inline-block border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold text-ink no-underline shadow-[3px_3px_0_var(--ink)]">
            映画の賞の交差
          </a>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
