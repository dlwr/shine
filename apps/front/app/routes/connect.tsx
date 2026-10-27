import type {Route} from './+types/connect';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {NOINDEX_FOLLOW, buildSocialMeta, SITE_URL} from '@/lib/meta';
import {tryApiJson, type LoadContext} from '@/lib/api';
import type {
  ConnectPickData,
  MovieConnectionData,
  MovieSearchData,
} from '@/lib/api-types';

type ConnectState = {from: string; to: string; fq: string; tq: string};

type Candidate = {uid: string; title: string; year?: number};

type Link = NonNullable<MovieConnectionData['links']>[number];

const ROLE_LABELS: Record<Link['role'], string> = {
  director: '監督',
  cast: '出演',
  'director-and-cast': '監督と出演',
};

function connectHref(state: Partial<ConnectState>): string {
  const parameters = new URLSearchParams(
    Object.entries(state).filter(([, value]) => value),
  );
  return `/connect?${parameters.toString()}`;
}

async function searchMovies(
  context: LoadContext,
  query: string,
  signal: AbortSignal,
): Promise<Candidate[]> {
  if (!query) {
    return [];
  }

  const result = await tryApiJson<MovieSearchData>(
    context,
    `/movies/search?q=${encodeURIComponent(query)}&page=1&limit=5`,
    {signal},
  );
  return (result?.movies ?? []).map(({uid, title, year}) => ({
    uid,
    title,
    year,
  }));
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {connection} = loaderData;
  const description = connection?.links
    ? `『${connection.from.title}』と『${connection.to.title}』は${connection.links.length}手でつながる。`
    : '2本の映画が、何人の監督・出演者をはさんでつながるかを探す。';
  return [
    ...buildSocialMeta({
      title: '映画の距離 | SHINE',
      description,
      path: '/connect',
      locale: loaderData.locale,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    NOINDEX_FOLLOW,
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const parameters = new URL(request.url).searchParams;
  const state: ConnectState = {
    from: parameters.get('from') ?? '',
    to: parameters.get('to') ?? '',
    fq: parameters.get('fq') ?? '',
    tq: parameters.get('tq') ?? '',
  };
  const {signal} = request;
  const [connection, fromCandidates, toCandidates, pick] = await Promise.all([
    state.from && state.to
      ? tryApiJson<MovieConnectionData>(
          context,
          `/connect?from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`,
          {signal},
        )
      : undefined,
    searchMovies(context, state.fq, signal),
    searchMovies(context, state.tq, signal),
    tryApiJson<ConnectPickData>(context, '/connect/pick', {signal}),
  ]);
  return {
    state,
    connection,
    fromCandidates,
    toCandidates,
    pick,
    locale: getLocaleFromRequest(request),
  };
}

function MovieTitle({movie}: {movie: Candidate}) {
  return (
    <a
      href={`/movies/${movie.uid}`}
      className="block min-w-0 font-display font-bold text-lg leading-tight break-words no-underline text-ink">
      『{movie.title}』
      {movie.year && (
        <span className="font-label text-xs font-normal text-ink-muted ml-2">
          {movie.year}年
        </span>
      )}
    </a>
  );
}

function MoviePicker({
  label,
  side,
  state,
  candidates,
}: {
  label: string;
  side: 'from' | 'to';
  state: ConnectState;
  candidates: Candidate[];
}) {
  const queryKey = side === 'from' ? 'fq' : 'tq';
  const other =
    side === 'from'
      ? {to: state.to, tq: state.tq}
      : {from: state.from, fq: state.fq};
  return (
    <div className="min-w-0">
      <form method="get" action="/connect">
        {Object.entries(other).map(
          ([name, value]) =>
            value && (
              <input key={name} type="hidden" name={name} value={value} />
            ),
        )}
        <label className="block font-label text-xs text-ink-muted mb-1">
          {label}
          <span className="flex border border-ink mt-1">
            <input
              type="search"
              name={queryKey}
              defaultValue={state[queryKey]}
              placeholder="題名で探す"
              className="flex-1 min-w-0 bg-surface px-3 py-2 text-ink focus:outline-none"
            />
            <button
              type="submit"
              className="bg-ink px-3 font-display font-bold text-paper">
              探す
            </button>
          </span>
        </label>
      </form>
      {candidates.length > 0 && (
        <ul className="list-none p-0 mt-2">
          {candidates.map(candidate => (
            <li key={candidate.uid} className="border-b border-rule">
              <a
                href={connectHref({...state, [side]: candidate.uid})}
                aria-current={
                  candidate.uid === state[side] ? 'true' : undefined
                }
                className={`flex items-baseline justify-between gap-3 py-2 no-underline text-ink ${candidate.uid === state[side] ? 'font-bold' : ''}`}>
                <span className="min-w-0 break-words">{candidate.title}</span>
                {candidate.year && (
                  <span className="shrink-0 font-label text-xs text-ink-muted">
                    {candidate.year}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ConnectPage({loaderData}: Route.ComponentProps) {
  const {state, connection, fromCandidates, toCandidates, pick} = loaderData;
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          映画の距離
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          2本の映画が、何人の監督・出演者をはさんでつながるか。3人まで探す。
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <MoviePicker
            label="1本目"
            side="from"
            state={state}
            candidates={fromCandidates}
          />
          <MoviePicker
            label="2本目"
            side="to"
            state={state}
            candidates={toCandidates}
          />
        </div>

        {pick && (
          <p className="mb-8">
            <a
              href={connectHref({from: pick.from, to: pick.to})}
              className="inline-block border border-ink px-3 py-1.5 font-label text-xs font-bold no-underline text-ink">
              おまかせ
            </a>
          </p>
        )}

        {connection && (
          <section className="border-t-[3px] border-ink pt-4">
            <p className="font-display font-bold text-xl md:text-2xl mb-6">
              {connection.links
                ? `${connection.links.length}手でつながる`
                : '3手ではつながらない'}
            </p>
            {connection.links ? (
              <ol className="list-none p-0">
                <li>
                  <MovieTitle movie={connection.from} />
                </li>
                {connection.links.map(link => (
                  <li key={link.person.uid}>
                    <p className="border-l-2 border-ink ml-3 pl-4 py-3 font-label text-sm">
                      <a href={`/people/${link.person.uid}`}>
                        {link.person.name}
                      </a>
                      が{ROLE_LABELS[link.role]}
                    </p>
                    <MovieTitle movie={link.movie} />
                  </li>
                ))}
              </ol>
            ) : (
              <div className="grid gap-2">
                <MovieTitle movie={connection.from} />
                <MovieTitle movie={connection.to} />
              </div>
            )}
          </section>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
