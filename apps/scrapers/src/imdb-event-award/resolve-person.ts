import {and, eq} from 'drizzle-orm';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {matchPersonName, normalizePersonName} from '../common/japanese-name';
import {
  fetchTMDBCredits,
  fetchTMDBPerson,
  type TMDBCastCredit,
  type TMDBCredits,
} from '../common/tmdb-utilities';
import {
  type SelectedCredit,
  selectCredits,
  upsertMovieCredits,
} from '../movie-credits';
import {
  type DatabaseClient,
  type ImportContext,
  type PersonRole,
} from './types';

export async function creditedPeople(
  database: DatabaseClient,
  movieUid: string,
  role: PersonRole,
): Promise<Map<string, string>> {
  const rows = await database
    .select({
      uid: people.uid,
      name: people.name,
      localizedName: translations.content,
    })
    .from(movieCredits)
    .innerJoin(people, eq(people.uid, movieCredits.personUid))
    .leftJoin(
      translations,
      and(
        eq(translations.resourceUid, people.uid),
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'ja'),
      ),
    )
    .where(
      and(
        eq(movieCredits.movieUid, movieUid),
        role === 'director'
          ? eq(movieCredits.job, 'Director')
          : eq(movieCredits.department, 'Acting'),
      ),
    );

  const byName = new Map<string, string>();
  for (const row of rows) {
    for (const name of [row.name, row.localizedName]) {
      if (name) {
        byName.set(normalizePersonName(name), row.uid);
      }
    }
  }

  return byName;
}

type CreditMember = {id: number; name: string; original_name: string};

function creditMembers(credits: TMDBCredits, role: PersonRole): CreditMember[] {
  return role === 'director'
    ? credits.crew.filter(member => member.job === 'Director')
    : credits.cast;
}

function nameCandidates(members: CreditMember[]): Map<string, number> {
  return new Map(
    members.flatMap(member =>
      [member.name, member.original_name].map(
        candidate => [normalizePersonName(candidate), member.id] as const,
      ),
    ),
  );
}

/**
 * 保存済みクレジットに居ない人物をTMDbから引き当てる。キャストは上位10名しか
 * 保存していないので助演のノミニーが漏れる。本名が非ラテン文字の人物は
 * 日本語版のクレジット名と合わないので英語版でも照合する。
 * クレジットの無い映画は全クレジットを保存し、居なければ当たった1件だけ足す
 */
export async function resolveFromTmdbCredits(
  context: ImportContext,
  movieUid: string,
  name: string,
  role: PersonRole,
): Promise<string | undefined> {
  const {database, tmdbApiKey} = context;
  if (!tmdbApiKey) {
    return undefined;
  }

  const [movie] = await database
    .select({tmdbId: movies.tmdbId})
    .from(movies)
    .where(eq(movies.uid, movieUid))
    .limit(1);
  if (!movie?.tmdbId) {
    return undefined;
  }

  const credits = await fetchTMDBCredits(movie.tmdbId, 'movie', tmdbApiKey);
  if (!credits) {
    return undefined;
  }

  const members = creditMembers(credits, role);
  let tmdbPersonId = matchPersonName(name, nameCandidates(members));
  if (tmdbPersonId === undefined) {
    const english = await fetchTMDBCredits(
      movie.tmdbId,
      'movie',
      tmdbApiKey,
      'en-US',
    );
    if (english) {
      tmdbPersonId = matchPersonName(
        name,
        nameCandidates(creditMembers(english, role)),
      );
    }
  }

  if (tmdbPersonId === undefined) {
    return undefined;
  }

  const selected = selectCredits(credits);
  const credit =
    selected.find(entry => entry.tmdbPersonId === tmdbPersonId) ??
    castCredit(credits.cast.find(member => member.id === tmdbPersonId));
  if (!credit) {
    return undefined;
  }

  const [stored] = await database
    .select({uid: movieCredits.uid})
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, movieUid))
    .limit(1);
  const toSave = stored
    ? [credit]
    : [...selected.filter(entry => entry.creditId !== credit.creditId), credit];

  const personUidByTmdbId = await upsertMovieCredits(
    {database, isDryRun: false},
    movieUid,
    toSave,
  );

  return personUidByTmdbId.get(tmdbPersonId);
}

/** 記事の人名が TMDb のクレジットに無い人物を、override の TMDb 人物 ID で足す */
export async function resolveFromPersonOverride(
  context: ImportContext,
  movieUid: string,
  key: string,
  role: PersonRole,
): Promise<string | undefined> {
  const {database, tmdbApiKey, personOverrides} = context;
  const tmdbPersonId = personOverrides.get(key);
  if (tmdbPersonId === undefined || !tmdbApiKey) {
    return undefined;
  }

  const person = await fetchTMDBPerson(tmdbPersonId, tmdbApiKey, 'ja-JP');
  if (!person) {
    return undefined;
  }

  const credit: SelectedCredit = {
    creditId: `override-${tmdbPersonId}-${movieUid}`,
    tmdbPersonId,
    name: person.name,
    localizedName: person.name,
    profilePath: person.profile_path ?? undefined,
    department: role === 'director' ? 'Directing' : 'Acting',
    job: role === 'director' ? 'Director' : undefined,
    character: undefined,
    castOrder: undefined,
  };
  const personUidByTmdbId = await upsertMovieCredits(
    {database, isDryRun: false},
    movieUid,
    [...(await creditsForEmptyMovie(context, movieUid)), credit],
  );

  return personUidByTmdbId.get(tmdbPersonId);
}

/** クレジットの無い映画には TMDb の全クレジットも入れる。override の人物だけの映画にしない */
async function creditsForEmptyMovie(
  context: ImportContext,
  movieUid: string,
): Promise<SelectedCredit[]> {
  const {database, tmdbApiKey} = context;
  const [stored] = await database
    .select({uid: movieCredits.uid})
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, movieUid))
    .limit(1);
  if (stored || !tmdbApiKey) {
    return [];
  }

  const [movie] = await database
    .select({tmdbId: movies.tmdbId})
    .from(movies)
    .where(eq(movies.uid, movieUid))
    .limit(1);
  if (!movie?.tmdbId) {
    return [];
  }

  const credits = await fetchTMDBCredits(movie.tmdbId, 'movie', tmdbApiKey);
  return credits ? selectCredits(credits) : [];
}

function castCredit(member: TMDBCastCredit | undefined) {
  return (
    member && {
      creditId: member.credit_id,
      tmdbPersonId: member.id,
      name: member.original_name,
      localizedName: member.name,
      profilePath: member.profile_path ?? undefined,
      department: 'Acting',
      job: undefined,
      character: member.character ?? undefined,
      castOrder: member.order,
    }
  );
}
