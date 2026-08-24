import type {Route} from './+types/people.$id';
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
};

export type PersonData = {
  uid: string;
  name: string;
  originalName: string;
  profilePath?: string;
  credits: PersonCreditData[];
};

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
  return `${person.name}が関わった映画${person.credits.length}本（${jobs.values().toArray().join('・')}）。SHINEに収録された映画賞の受賞作・ノミネート作から一覧できます。`;
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
    imageUrl: `${SITE_URL}/og/home.png`,
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

function CreditRow({credit}: {credit: PersonCreditData}) {
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
      <span className="flex-1 font-display font-extrabold text-sm leading-none">
        {title}
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
          </div>
        </div>

        <div>
          {person.credits.map(credit => (
            <CreditRow key={credit.movieUid} credit={credit} />
          ))}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
