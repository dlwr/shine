import {and, eq, isNull, sql} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {BaseService} from './base-service';
import type {PeopleListResult, PersonDetail} from '@shine/types';

const movieCount = sql<number>`COUNT(DISTINCT ${movieCredits.movieUid})`;

export class PeopleService extends BaseService {
  async listPeople({
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }): Promise<PeopleListResult> {
    const eligible = this.database
      .select({
        uid: people.uid,
        name: people.name,
        movieCount: movieCount.as('movie_count'),
      })
      .from(people)
      .innerJoin(movieCredits, eq(movieCredits.personUid, people.uid))
      .innerJoin(
        movies,
        and(eq(movies.uid, movieCredits.movieUid), isNull(movies.deletedAt)),
      )
      .groupBy(people.uid)
      .having(
        sql`${movieCount} >= 2 OR SUM(${movieCredits.job} = 'Director') > 0`,
      )
      .as('eligible');

    const [countRow] = await this.database
      .select({totalCount: sql<number>`COUNT(*)`})
      .from(eligible);
    const totalCount = countRow?.totalCount ?? 0;

    const rows = await this.database
      .select()
      .from(eligible)
      .orderBy(sql`${eligible.movieCount} DESC`, eligible.uid)
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      people: rows,
      pagination: {
        page,
        perPage: limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  async getPerson(
    personUid: string,
    locale: string,
  ): Promise<PersonDetail | undefined> {
    const personRows = await this.database
      .select({
        uid: people.uid,
        name: people.name,
        profilePath: people.profilePath,
        localizedName: translations.content,
      })
      .from(people)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, people.uid),
          eq(translations.resourceType, 'person_name'),
          eq(translations.languageCode, locale),
        ),
      )
      .where(eq(people.uid, personUid))
      .limit(1);

    const person = personRows[0];
    if (!person) {
      return undefined;
    }

    const creditRows = await this.database
      .select({
        movieUid: movies.uid,
        year: movies.year,
        job: movieCredits.job,
        character: movieCredits.character,
        title: sql<string | null>`
					(
					  SELECT content
					  FROM translations
					  WHERE translations.resource_uid = movies.uid
					    AND translations.resource_type = 'movie_title'
					  ORDER BY (translations.language_code = ${locale}) DESC,
					    translations.is_default DESC,
					    (translations.language_code = 'en') DESC
					  LIMIT 1
					)
				`.as('title'),
        posterUrl: sql<string | null>`
					(
					  SELECT url
					  FROM poster_urls
					  WHERE poster_urls.movie_uid = movies.uid
					  ORDER BY poster_urls.is_primary DESC
					  LIMIT 1
					)
				`.as('poster_url'),
      })
      .from(movieCredits)
      .innerJoin(movies, eq(movies.uid, movieCredits.movieUid))
      .where(
        and(eq(movieCredits.personUid, personUid), isNull(movies.deletedAt)),
      )
      .orderBy(sql`${movies.year} DESC`);

    const byMovie = new Map<string, PersonDetail['credits'][number]>();
    for (const row of creditRows) {
      const credit = byMovie.get(row.movieUid) ?? {
        movieUid: row.movieUid,
        title: row.title ?? undefined,
        year: row.year ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        jobs: [],
        character: undefined,
      };

      if (row.job && !credit.jobs.includes(row.job)) {
        credit.jobs.push(row.job);
      }

      credit.character ??= row.character ?? undefined;
      byMovie.set(row.movieUid, credit);
    }

    return {
      uid: person.uid,
      name: person.localizedName ?? person.name,
      originalName: person.name,
      profilePath: person.profilePath ?? undefined,
      credits: byMovie.values().toArray(),
    };
  }
}
