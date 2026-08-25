import type {Route} from './+types/people';
import {Masthead} from '@/components/editorial/masthead';
import {PersonPortrait} from '@/components/editorial/person-portrait';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';

type ProminentMovie = {
  uid: string;
  title?: string;
  year?: number;
};

type ProminentPerson = {
  uid: string;
  name: string;
  originalName: string;
  profilePath?: string;
  wonCount: number;
  nominatedCount: number;
  topMovies: ProminentMovie[];
};

type ProminentPeople = {
  directors: ProminentPerson[];
  actors: ProminentPerson[];
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as {locale?: Locale};

  return buildSocialMeta({
    title: '映画人 | SHINE',
    description:
      'SHINEが記録する映画賞の監督賞・演技賞で最も多く勝った監督と俳優のランキング。受賞回数で並べ、受賞作から作品ページへ辿れます。',
    path: '/people',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(`${apiUrl}/people/prominent?locale=${locale}`, {
    signal: request.signal,
  });
  if (!response.ok) {
    throw new Response('Failed to load people', {status: 502});
  }

  const body = (await response.json()) as ProminentPeople;
  return {...body, locale};
}

function PersonRow({person, rank}: {person: ProminentPerson; rank: number}) {
  return (
    <li
      aria-label={person.name}
      className="flex items-start gap-3 border-t-2 border-ink py-3">
      <span className="w-6 shrink-0 pt-1 font-mono text-xs tabular-nums text-ink-muted">
        {String(rank).padStart(2, '0')}
      </span>
      <PersonPortrait
        name={person.name}
        profilePath={person.profilePath}
        className="w-12 shrink-0 md:w-16"
      />
      <div className="min-w-0 flex-1">
        <a
          href={`/people/${person.uid}`}
          className="font-display text-base font-extrabold leading-tight text-ink no-underline">
          {person.name}
        </a>
        {person.originalName !== person.name && (
          <p className="font-mono text-[10px] text-ink-muted">
            {person.originalName}
          </p>
        )}
        <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
          <span className="font-bold text-brand">{person.wonCount}</span>
          回受賞 / {person.nominatedCount}回ノミネート
        </p>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
          {person.topMovies.map(movie => (
            <a
              key={movie.uid}
              href={`/movies/${movie.uid}`}
              className="border-b border-ink-muted font-mono text-[10px] text-ink no-underline">
              {movie.title ?? 'Unknown Title'}
              {movie.year ? ` ${movie.year}` : ''}
            </a>
          ))}
        </div>
      </div>
    </li>
  );
}

function Ranking({
  title,
  subtitle,
  people,
}: {
  title: string;
  subtitle: string;
  people: ProminentPerson[];
}) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-black tracking-tight">
        {title}
      </h2>
      <p className="mb-3 font-mono text-xs text-ink-muted">{subtitle}</p>
      <ul className="list-none border-b-2 border-ink p-0">
        {people.map((person, index) => (
          <PersonRow key={person.uid} person={person} rank={index + 1} />
        ))}
      </ul>
    </section>
  );
}

export default function PeoplePage({loaderData}: Route.ComponentProps) {
  const {directors, actors, locale} = loaderData as ProminentPeople & {
    locale: Locale;
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="mb-2 font-display text-2xl font-black tracking-tight md:text-3xl">
          PEOPLE
        </h1>
        <p className="mb-8 font-mono text-xs text-ink-muted">
          最も多く勝った映画人
        </p>

        <section className="mb-10 border-t-2 border-b-2 border-ink py-4">
          <p className="font-display text-sm leading-relaxed md:text-base">
            映画賞は作品に贈られる。だが撮ったのは人で、演じたのも人だ。
            <br />
            SHINEが記録する映画賞の監督賞と演技賞で、受賞回数の多い監督と俳優を並べた。
          </p>
        </section>

        <Ranking title="DIRECTORS" subtitle="監督賞" people={directors} />
        <Ranking title="ACTORS" subtitle="主演・助演の演技賞" people={actors} />

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
