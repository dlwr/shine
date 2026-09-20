import {and, eq, inArray, isNull, sql} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {
  AwardDetail,
  AwardMovieEntry,
  AwardSummary,
  AwardYearDetail,
  AwardYearGroup,
} from '../types/awards';
import {
  movieTitleColumns,
  resolveCategoryUids,
  summarizeAward,
} from './award-category-queries';
import {BaseService} from './base-service';
import {
  awardPageDefinitions,
  personAwardDefinitions,
} from './award-definitions';
import {compareAwardMovies, flattenListAward} from './award-page-ordering';
import {loadWatchableAvailabilityByMovie} from './watchable-availability';

function posterUrlColumn() {
  return sql<string | null>`(
      SELECT url FROM poster_urls
      WHERE poster_urls.movie_uid = movies.uid
      ORDER BY poster_urls.is_primary DESC
      LIMIT 1
    )`.as('posterUrl');
}

type AwardMovieRow = {
  movieUid: string;
  movieYear: number | null;
  isWinner: number;
  specialMention: string | null;
  jaTitle: string | null;
  defaultTitle: string | null;
  posterUrl: string | null;
};

function toAwardMovieEntry(row: AwardMovieRow): AwardMovieEntry {
  return {
    uid: row.movieUid,
    title: row.jaTitle ?? row.defaultTitle ?? undefined,
    movieYear: row.movieYear ?? undefined,
    posterUrl: row.posterUrl ?? undefined,
    isWinner: row.isWinner === 1,
    specialMention: row.specialMention ?? undefined,
  };
}

export class AwardsService extends BaseService {
  async getAwardBySlug(slug: string): Promise<AwardDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition) {
      return undefined;
    }

    const categoryUids = await resolveCategoryUids(this.database, definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        movieUid: movies.uid,
        movieYear: movies.year,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        ceremonyYear: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        ...movieTitleColumns(),
        posterUrl: posterUrlColumn(),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const groups = new Map<number, AwardYearGroup>();
    for (const row of rows) {
      let group = groups.get(row.ceremonyYear);
      if (!group) {
        group = {
          year: row.ceremonyYear,
          ceremonyNumber: row.ceremonyNumber ?? undefined,
          filmCount: 0,
          movies: [],
        };
        groups.set(row.ceremonyYear, group);
      }

      const existing = group.movies.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      group.movies.push(toAwardMovieEntry(row));
    }

    const years = groups
      .values()
      .toArray()
      .toSorted((a, b) => b.year - a.year);
    for (const group of years) {
      group.filmCount = group.movies.length;
      group.movies.sort(compareAwardMovies);
    }

    const base = {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: definition.grouping,
      ...(definition.subAward && {subAward: true}),
    };

    if (definition.grouping === 'year') {
      return {
        ...base,
        years: years.map(group => ({
          ...group,
          movies: group.movies.filter(movie => movie.isWinner),
        })),
      };
    }

    return {...base, years: flattenListAward(years)};
  }

  async getAwardYear(
    slug: string,
    year: number,
  ): Promise<AwardYearDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition || definition.grouping !== 'year') {
      return undefined;
    }

    const categoryUids = await resolveCategoryUids(this.database, definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        movieUid: movies.uid,
        movieYear: movies.year,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        ...movieTitleColumns(),
        posterUrl: posterUrlColumn(),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          eq(awardCeremonies.year, year),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const movieEntries: AwardMovieEntry[] = [];
    for (const row of rows) {
      const existing = movieEntries.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      movieEntries.push(toAwardMovieEntry(row));
    }

    movieEntries.sort(compareAwardMovies);

    const availabilityByMovie = await loadWatchableAvailabilityByMovie(
      this.database,
      movieEntries.map(movie => movie.uid),
    );
    for (const movie of movieEntries) {
      movie.availability = availabilityByMovie.get(movie.uid);
    }

    const yearRows = await this.database
      .selectDistinct({year: awardCeremonies.year})
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    const years = yearRows.map(row => row.year).toSorted((a, b) => a - b);
    const index = years.indexOf(year);

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      year,
      ceremonyNumber: rows[0].ceremonyNumber ?? undefined,
      movies: movieEntries,
      // eslint-disable-next-line unicorn/no-useless-undefined -- 三項の分岐として省略できない
      previousYear: index > 0 ? years[index - 1] : undefined,
      nextYear: index < years.length - 1 ? years[index + 1] : undefined,
    };
  }

  async listAwards(): Promise<AwardSummary[]> {
    const summaries: AwardSummary[] = [];

    for (const definition of awardPageDefinitions) {
      const summary = await summarizeAward(
        this.database,
        definition,
        definition.grouping,
      );
      if (summary) {
        summaries.push(summary);
      }
    }

    for (const definition of personAwardDefinitions) {
      const summary = await summarizeAward(this.database, definition, 'person');
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }
}
