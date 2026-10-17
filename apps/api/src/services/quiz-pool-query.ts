import {and, eq, isNull, sql, type getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {describeNomination} from './quiz-nomination';

const MINIMUM_ORGANIZATIONS = 2;

type Database = ReturnType<typeof getDatabase>;

export type QuizPoolEntry = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string;
  originalLanguage: string;
  organizations: string[];
  achievements: string[];
};

async function queryEligibleMovies(database: Database) {
  return database
    .select({
      uid: movies.uid,
      year: movies.year,
      originalLanguage: movies.originalLanguage,
      title: sql<string>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = movies.uid
          AND translations.resource_type = 'movie_title'
          AND translations.language_code = 'ja'
        LIMIT 1
      )`.as('title'),
      // 邦題ポスターには答えが刷られているので最後に回す
      posterUrl: sql<string>`(
        SELECT url FROM poster_urls
        WHERE poster_urls.movie_uid = movies.uid
        ORDER BY
          CASE WHEN poster_urls.language_code = 'ja' THEN 1 ELSE 0 END ASC,
          poster_urls.is_primary DESC,
          poster_urls.url ASC
        LIMIT 1
      )`.as('posterUrl'),
    })
    .from(movies)
    .where(
      and(
        isNull(movies.deletedAt),
        sql`EXISTS (
          SELECT 1 FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
        )`,
        sql`EXISTS (
          SELECT 1 FROM poster_urls WHERE poster_urls.movie_uid = movies.uid
        )`,
      ),
    );
}

async function queryNominationFacts(database: Database) {
  return database
    .select({
      movieUid: nominations.movieUid,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
      ceremonyYear: awardCeremonies.year,
      organizationName: awardOrganizations.name,
      categoryName: awardCategories.name,
    })
    .from(nominations)
    .innerJoin(
      awardCeremonies,
      eq(nominations.ceremonyUid, awardCeremonies.uid),
    )
    .innerJoin(
      awardOrganizations,
      eq(awardCeremonies.organizationUid, awardOrganizations.uid),
    )
    .innerJoin(
      awardCategories,
      eq(nominations.categoryUid, awardCategories.uid),
    );
}

export async function queryQuizPool(
  database: Database,
): Promise<QuizPoolEntry[]> {
  const eligible = await queryEligibleMovies(database);
  const entries = new Map<string, QuizPoolEntry>(
    eligible.map(movie => [
      movie.uid,
      {
        uid: movie.uid,
        title: movie.title,
        year: movie.year ?? undefined,
        posterUrl: movie.posterUrl,
        originalLanguage: movie.originalLanguage,
        organizations: [],
        achievements: [],
      },
    ]),
  );

  const facts = await queryNominationFacts(database);
  for (const row of facts) {
    const entry = entries.get(row.movieUid);
    if (!entry) {
      continue;
    }

    const {organization, achievement} = describeNomination({
      organizationName: row.organizationName,
      categoryName: row.categoryName,
      ceremonyYear: row.ceremonyYear,
      isWinner: row.isWinner === 1,
      specialMention: row.specialMention ?? undefined,
    });

    if (!entry.organizations.includes(organization)) {
      entry.organizations.push(organization);
    }

    if (!entry.achievements.includes(achievement)) {
      entry.achievements.push(achievement);
    }
  }

  return entries
    .values()
    .filter(entry => entry.organizations.length >= MINIMUM_ORGANIZATIONS)
    .toArray()
    .toSorted((a, b) => a.uid.localeCompare(b.uid));
}
