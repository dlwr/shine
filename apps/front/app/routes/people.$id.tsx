import type {Route} from './+types/people.$id';
import {
  AwardTags,
  PersonalAwardTags,
  type PersonalAward,
} from '@/components/editorial/award-tags';
import {Masthead} from '@/components/editorial/masthead';
import {FirstPickSection} from '@/components/editorial/first-pick-section';
import {PersonAwardHistory} from '@/components/editorial/person-award-history';
import {PersonTimeline} from '@/components/editorial/person-timeline';
import {PersonPortrait} from '@/components/editorial/person-portrait';
import {AvailabilityStatusMark} from '@/components/editorial/availability-status-mark';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {NOINDEX_FOLLOW, SITE_URL, buildSocialMeta} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {PersonData} from '@/lib/api-types';
import {personFirstPick} from '@/lib/first-pick';

export type PersonCreditData = PersonData['credits'][number];
export type PersonAwardData = PersonData['awards'][number];

function yearGroupedSlugs(person: PersonData): Set<string> {
  return new Set(
    person.awards
      .filter(award => award.grouping === 'year')
      .map(award => award.slug),
  );
}

function awardRecord(person: PersonData): {won: number; nominated: number} {
  const yearGrouped = yearGroupedSlugs(person);
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

function PersonalRecordLine({record}: {record: PersonalAwardRecord}) {
  return (
    <p className="mt-1 font-label text-xs text-ink-muted">
      {record.slug ? (
        <a href={`/awards/${record.slug}`} className="text-ink-muted">
          {record.organization} {record.category}
        </a>
      ) : (
        `${record.organization} ${record.category}`
      )}{' '}
      <span className="whitespace-nowrap">
        <span className="font-bold text-brand">{record.won}</span>受賞
      </span>{' '}
      / <span className="whitespace-nowrap">{record.nominated}ノミネート</span>
    </p>
  );
}

function roleLabel(credit: PersonCreditData): string {
  const labels = credit.jobs.map(job => JOB_LABELS[job] ?? job);

  if (credit.character !== undefined) {
    labels.push('出演');
  }

  return labels.length > 0 ? labels.join('・') : '出演';
}

function filmographyLabel(person: PersonData): string {
  const directed = person.credits.some(credit =>
    credit.jobs.includes('Director'),
  );
  const acted = person.credits.some(credit => credit.character !== undefined);

  if (directed && acted) {
    return '監督・出演映画一覧';
  }

  if (directed) {
    return '監督映画一覧';
  }

  return acted ? '出演映画一覧' : '映画一覧';
}

function creditWeight(credit: PersonCreditData): number {
  if (credit.personAwards.some(award => award.isWinner)) {
    return 3;
  }

  if (credit.awards.some(award => award.isWinner)) {
    return 2;
  }

  return credit.personAwards.length > 0 || credit.awards.length > 0 ? 1 : 0;
}

function signatureTitles(person: PersonData): string {
  const picks = person.credits
    .filter(credit => credit.title !== undefined)
    .toSorted((a, b) => creditWeight(b) - creditWeight(a))
    .slice(0, 3)
    .map(credit =>
      credit.year === undefined
        ? `『${credit.title}』`
        : `『${credit.title}』（${credit.year}）`,
    );
  return picks.length > 0 ? `代表作に${picks.join('、')}。` : '';
}

function personDescription(person: PersonData): string {
  const {won} = awardRecord(person);
  const record = won > 0 ? `うち${won}本が受賞。` : '';
  return `${person.name}の${filmographyLabel(person)}（全${person.credits.length}本）。${signatureTitles(person)}${record}`;
}

// API の人物一覧（sitemap の元）と同じ線: 個人賞にノミネートされた人物
function isWorthIndexing(person: PersonData): boolean {
  return person.credits.some(credit => credit.personAwards.length > 0);
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {person, locale} = loaderData as {
    person: PersonData;
    locale?: Locale;
  };

  const social = buildSocialMeta({
    title: `${person.name}の${filmographyLabel(person)}（全${person.credits.length}本） | SHINE`,
    description: personDescription(person),
    path: `/people/${person.uid}`,
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/person.png?id=${person.uid}`,
    largeImage: true,
  });

  return isWorthIndexing(person) ? social : [...social, NOINDEX_FOLLOW];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const person = await loadApiJson<PersonData>(
    context,
    `/people/${params.id}?locale=${locale}`,
    {label: 'person', signal: request.signal},
  );
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
        <AvailabilityStatusMark
          status={credit.availabilityStatus}
          className="self-start"
        />
        <PersonalAwardTags awards={credit.personAwards} />
        <AwardTags tags={credit.awards} legend={legend} />
      </span>
      <span className="font-label text-[10px] text-ink-muted shrink-0">
        {roleLabel(credit)}
      </span>
      {credit.year && (
        <span className="font-label text-xs text-ink-muted shrink-0 tabular-nums">
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
  const firstPick = personFirstPick(person.credits);

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
            <h1 className="mb-2 font-display text-2xl font-bold md:text-3xl">
              {person.name}
            </h1>
            <p className="font-label text-xs text-ink-muted">
              {person.name === person.originalName
                ? `出演・監督 ${person.credits.length} 本`
                : `${person.originalName} 出演・監督 ${person.credits.length} 本`}
            </p>
            {nominated > 0 && (
              <p className="mt-1 font-label text-xs text-ink-muted">
                <span className="whitespace-nowrap">
                  <span className="font-bold text-brand">{won}</span>作受賞
                </span>{' '}
                /{' '}
                <span className="whitespace-nowrap">
                  {nominated}作ノミネート
                </span>
              </p>
            )}
            {personalRecords.slice(0, 3).map(record => (
              <PersonalRecordLine
                key={`${record.organization} ${record.category}`}
                record={record}
              />
            ))}
            {personalRecords.length > 3 && (
              <details className="mt-1">
                <summary className="cursor-pointer font-label text-xs text-ink-muted">
                  ほか{personalRecords.length - 3}部門
                </summary>
                {personalRecords.slice(3).map(record => (
                  <PersonalRecordLine
                    key={`${record.organization} ${record.category}`}
                    record={record}
                  />
                ))}
              </details>
            )}
          </div>
        </div>

        {firstPick && <FirstPickSection pick={firstPick} />}

        {personalRecords.length > 0 && (
          <section className="mb-8">
            <p className="mb-2 font-label text-xs text-ink-muted">受賞歴</p>
            <PersonAwardHistory credits={person.credits} />
          </section>
        )}

        {person.collaborators.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-1 font-label text-xs text-ink-muted">
              よく組む人
            </h2>
            {person.collaborators.map(collaborator => (
              <a
                key={collaborator.uid}
                href={`/people/${collaborator.uid}`}
                className="flex items-baseline gap-3 py-2 border-t-2 border-ink no-underline text-ink">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-display font-extrabold text-sm leading-none">
                    {collaborator.name}
                  </span>
                  {collaborator.sampleMovieTitle && (
                    <span className="font-label text-[10px] text-ink-muted break-words">
                      『{collaborator.sampleMovieTitle}』ほか
                    </span>
                  )}
                </span>
                <span className="font-label text-xs text-ink-muted shrink-0 tabular-nums">
                  {collaborator.sharedMovieCount}本
                </span>
              </a>
            ))}
          </section>
        )}

        <PersonTimeline
          credits={person.credits}
          yearGroupedSlugs={yearGroupedSlugs(person)}
        />

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

export {type PersonData} from '@/lib/api-types';
