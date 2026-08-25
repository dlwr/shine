import type {Route} from './+types/people.$id';
import {
  AwardTags,
  PersonalAwardTags,
  type AwardTag,
  type AwardTagLegend,
  type PersonalAward,
} from '@/components/editorial/award-tags';
import {Masthead} from '@/components/editorial/masthead';
import {PersonPortrait} from '@/components/editorial/person-portrait';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';

export type PersonCreditData = {
  movieUid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  jobs: string[];
  character?: string;
  awards: AwardTag[];
  personAwards: PersonalAward[];
};

export type PersonAwardData = AwardTagLegend & {
  grouping: 'year' | 'list';
};

export type PersonData = {
  uid: string;
  name: string;
  originalName: string;
  profilePath?: string;
  credits: PersonCreditData[];
  awards: PersonAwardData[];
};

function awardRecord(person: PersonData): {won: number; nominated: number} {
  const yearGrouped = new Set(
    person.awards
      .filter(award => award.grouping === 'year')
      .map(award => award.slug),
  );
  const contested = person.credits.filter(credit =>
    credit.awards.some(award => yearGrouped.has(award.slug)),
  );

  return {
    won: contested.filter(credit =>
      credit.awards.some(
        award => yearGrouped.has(award.slug) && award.isWinner,
      ),
    ).length,
    nominated: contested.length,
  };
}

type PersonalAwardRecord = {
  slug?: string;
  organization: string;
  category: string;
  won: number;
  nominated: number;
};

/** 第17回までは1回の受賞に複数作品が紐づくので、回数は授賞式ごとに数える */
function personalAwardRecords(person: PersonData): PersonalAwardRecord[] {
  const ceremonies = new Map<string, PersonalAward>();

  for (const credit of person.credits) {
    for (const award of credit.personAwards) {
      const key = `${award.organization}|${award.category}|${award.year}`;
      const existing = ceremonies.get(key);
      if (existing) {
        existing.isWinner ||= award.isWinner;
      } else {
        ceremonies.set(key, {...award});
      }
    }
  }

  const records = new Map<string, PersonalAwardRecord>();
  for (const award of ceremonies.values()) {
    const key = `${award.organization} ${award.category}`;
    const record = records.get(key) ?? {
      slug: award.slug,
      organization: award.organization,
      category: award.category,
      won: 0,
      nominated: 0,
    };
    record.nominated++;
    if (award.isWinner) {
      record.won++;
    }

    records.set(key, record);
  }

  return records
    .values()
    .toArray()
    .toSorted((a, b) => b.won - a.won || b.nominated - a.nominated);
}

const JOB_LABELS: Record<string, string> = {
  Director: '監督',
  Screenplay: '脚本',
  Writer: '脚本',
  Story: '原作',
  'Director of Photography': '撮影',
  Editor: '編集',
  'Original Music Composer': '音楽',
};

function roleLabel(credit: PersonCreditData): string {
  const labels = credit.jobs.map(job => JOB_LABELS[job] ?? job);

  if (credit.character !== undefined) {
    labels.push('出演');
  }

  return labels.length > 0 ? labels.join('・') : '出演';
}

function personDescription(person: PersonData): string {
  const jobs = new Set(
    person.credits.map(credit => roleLabel(credit).split(' — ', 1)[0]),
  );
  const {won} = awardRecord(person);
  const record = won > 0 ? `うち${won}本が受賞。` : '';
  return `${person.name}が関わった映画${person.credits.length}本（${jobs.values().toArray().join('・')}）。${record}SHINEに収録された映画賞の受賞作・ノミネート作から一覧できます。`;
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {person, locale} = loaderData as {
    person: PersonData;
    locale?: Locale;
  };

  return buildSocialMeta({
    title: `${person.name}の映画 全${person.credits.length}本 | SHINE`,
    description: personDescription(person),
    path: `/people/${person.uid}`,
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/person.png?id=${person.uid}`,
    largeImage: true,
  });
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(
    `${apiUrl}/people/${params.id}?locale=${locale}`,
    {signal: request.signal},
  );

  if (response.status === 404) {
    throw new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    throw new Response('Failed to load person', {status: 502});
  }

  const person = (await response.json()) as PersonData;
  return {person, locale};
}

function CreditRow({
  credit,
  legend,
}: {
  credit: PersonCreditData;
  legend: PersonAwardData[];
}) {
  const title = credit.title ?? 'Unknown Title';

  return (
    <a
      href={`/movies/${credit.movieUid}`}
      className="flex items-center gap-3 py-2 border-t-2 border-ink no-underline text-ink">
      <PosterFrame
        posterUrl={credit.posterUrl}
        alt={`${title} poster`}
        className="w-9 shrink-0"
        displaySize="w185"
      />
      <span className="flex flex-1 flex-col gap-1">
        <span className="font-display font-extrabold text-sm leading-none">
          {title}
        </span>
        <PersonalAwardTags awards={credit.personAwards} />
        <AwardTags tags={credit.awards} legend={legend} />
      </span>
      <span className="font-mono text-[10px] text-ink-muted shrink-0">
        {roleLabel(credit)}
      </span>
      {credit.year && (
        <span className="font-mono text-xs text-ink-muted shrink-0 tabular-nums">
          {credit.year}
        </span>
      )}
    </a>
  );
}

export default function PersonPage({loaderData}: Route.ComponentProps) {
  const {person} = loaderData as {person: PersonData};
  const locale = 'ja';
  const {won, nominated} = awardRecord(person);
  const personalRecords = personalAwardRecords(person);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <div className="mb-8 flex items-start gap-4">
          <PersonPortrait
            name={person.name}
            profilePath={person.profilePath}
            displaySize="w342"
            className="w-24 shrink-0 md:w-32"
          />
          <div>
            <h1 className="mb-2 font-display text-2xl font-black tracking-tight md:text-3xl">
              {person.name}
            </h1>
            <p className="font-mono text-xs text-ink-muted">
              {person.name === person.originalName
                ? `${person.credits.length} FILMS`
                : `${person.originalName} / ${person.credits.length} FILMS`}
            </p>
            {nominated > 0 && (
              <p className="mt-1 font-mono text-xs text-ink-muted">
                <span className="font-bold text-brand">{won}</span>
                作受賞 / {nominated}作ノミネート
              </p>
            )}
            {personalRecords.map(record => (
              <p
                key={`${record.organization} ${record.category}`}
                className="mt-1 font-mono text-xs text-ink-muted">
                {record.slug ? (
                  <a href={`/awards/${record.slug}`} className="text-ink-muted">
                    {record.organization} {record.category}
                  </a>
                ) : (
                  `${record.organization} ${record.category}`
                )}{' '}
                <span className="font-bold text-brand">{record.won}</span>
                受賞 / {record.nominated}ノミネート
              </p>
            ))}
          </div>
        </div>

        <div>
          {person.credits.map(credit => (
            <CreditRow
              key={credit.movieUid}
              credit={credit}
              legend={person.awards}
            />
          ))}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
