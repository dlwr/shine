import {and, eq, isNull, sql, type getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {describeNomination} from './quiz-nomination';

const MINIMUM_ORGANIZATIONS = 2;

export type QuizPoolEntry = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string;
  originalLanguage: string;
  organizations: string[];
  achievements: string[];
};

export async function queryQuizPool(
  database: ReturnType<typeof getDatabase>,
): Promise<QuizPoolEntry[]> {
  const rows = await database
    .select({
      uid: movies.uid,
      year: movies.year,
      originalLanguage: movies.originalLanguage,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
      ceremonyYear: awardCeremonies.year,
      organizationName: awardOrganizations.name,
      categoryName: awardCategories.name,
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
    )
    .innerJoin(movies, eq(nominations.movieUid, movies.uid))
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

  const entries = new Map<string, QuizPoolEntry>();
  for (const row of rows) {
    const {organization, achievement} = describeNomination({
      organizationName: row.organizationName,
      categoryName: row.categoryName,
      ceremonyYear: row.ceremonyYear,
      isWinner: row.isWinner === 1,
      specialMention: row.specialMention ?? undefined,
    });

    let entry = entries.get(row.uid);
    if (!entry) {
      entry = {
        uid: row.uid,
        title: row.title,
        year: row.year ?? undefined,
        posterUrl: row.posterUrl,
        originalLanguage: row.originalLanguage,
        organizations: [],
        achievements: [],
      };
      entries.set(row.uid, entry);
    }

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
