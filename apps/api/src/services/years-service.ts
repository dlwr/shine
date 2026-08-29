import {and, eq, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {
  awardPageDefinitions,
  awardPageNominations,
  findTopAwardPageDefinition,
} from './awards-service';
import {BaseService} from './base-service';
import type {YearDetail, YearMovie, YearSummary} from '@shine/types';

function compareYearMovies(a: YearMovie, b: YearMovie): number {
  return (
    Number(b.isWinner) - Number(a.isWinner) ||
    b.awards.length - a.awards.length ||
    (a.title ?? '').localeCompare(b.title ?? '', 'ja') ||
    a.uid.localeCompare(b.uid)
  );
}

export class YearsService extends BaseService {
  async listYears(): Promise<YearSummary[]> {
    const rows = await this.database
      .select({
        year: movies.year,
        movieCount: sql<number>`COUNT(DISTINCT ${movies.uid})`,
        winnerCount: sql<number>`COUNT(DISTINCT CASE WHEN ${nominations.isWinner} = 1 THEN ${movies.uid} END)`,
      })
      .from(movies)
      .innerJoin(nominations, eq(nominations.movieUid, movies.uid))
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(and(isNull(movies.deletedAt), awardPageNominations()))
      .groupBy(movies.year);

    return rows
      .filter(
        (row): row is typeof row & {year: number} =>
          typeof row.year === 'number',
      )
      .map(row => ({
        year: row.year,
        movieCount: row.movieCount,
        winnerCount: row.winnerCount,
      }))
      .toSorted((a, b) => b.year - a.year);
  }

  async getYear(year: number): Promise<YearDetail | undefined> {
    const rows = await this.database
      .select({
        movieUid: movies.uid,
        isWinner: nominations.isWinner,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
        posterUrl: sql<string | null>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY poster_urls.is_primary DESC
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
          eq(movies.year, year),
          isNull(movies.deletedAt),
          awardPageNominations(),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const byUid = new Map<string, YearMovie>();
    for (const row of rows) {
      const slug = findTopAwardPageDefinition(
        row.organizationName,
        row.categoryName,
      )?.slug;
      if (!slug) {
        continue;
      }

      let movie = byUid.get(row.movieUid);
      if (!movie) {
        movie = {
          uid: row.movieUid,
          title: row.jaTitle ?? row.defaultTitle ?? undefined,
          posterUrl: row.posterUrl ?? undefined,
          isWinner: false,
          awards: [],
        };
        byUid.set(row.movieUid, movie);
      }

      const isWinner = row.isWinner === 1;
      movie.isWinner ||= isWinner;

      const award = movie.awards.find(entry => entry.slug === slug);
      if (award) {
        award.isWinner ||= isWinner;
      } else {
        movie.awards.push({slug, isWinner});
      }
    }

    const slugOrder = new Map(
      awardPageDefinitions.map((definition, index) => [definition.slug, index]),
    );
    const movieEntries = byUid.values().toArray();
    for (const movie of movieEntries) {
      movie.awards.sort(
        (a, b) => (slugOrder.get(a.slug) ?? 0) - (slugOrder.get(b.slug) ?? 0),
      );
    }

    movieEntries.sort(compareYearMovies);

    const presentSlugs = new Set(
      movieEntries.flatMap(movie => movie.awards.map(award => award.slug)),
    );
    const awards = awardPageDefinitions
      .filter(definition => presentSlugs.has(definition.slug))
      .map(definition => ({
        slug: definition.slug,
        shortLabel: definition.shortLabel,
        name: definition.name,
        organization: definition.organization,
      }));

    const yearRows = await this.database
      .selectDistinct({year: movies.year})
      .from(movies)
      .innerJoin(nominations, eq(nominations.movieUid, movies.uid))
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(and(isNull(movies.deletedAt), awardPageNominations()));

    const years = yearRows
      .map(row => row.year)
      .filter((value): value is number => typeof value === 'number')
      .toSorted((a, b) => a - b);
    const index = years.indexOf(year);

    return {
      year,
      movies: movieEntries,
      awards,
      // eslint-disable-next-line unicorn/no-useless-undefined -- 三項の分岐として省略できない
      previousYear: index > 0 ? years[index - 1] : undefined,
      nextYear: index < years.length - 1 ? years[index + 1] : undefined,
    };
  }
}
