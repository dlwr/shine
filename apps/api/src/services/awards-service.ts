import {and, eq, inArray, isNull} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {
  AwardDetail,
  AwardMovieEntry,
  AwardSummary,
  AwardUnavailableList,
  AwardUnavailableMovie,
  AwardYearDetail,
  AwardYearGroup,
} from '../types/awards';
import type {JapanAvailabilitySummary} from '../types/common';
import {resolveCategoryUids, summarizeAward} from './award-category-queries';
import {BaseService} from './base-service';
import {
  awardPageDefinitions,
  personAwardDefinitions,
  type AwardPageDefinition,
} from './award-definitions';
import {adjacentYears} from './adjacent-years';
import {compareAwardMovies, flattenListAward} from './award-page-ordering';
import {summarizeJapanAvailability} from './japan-availability';
import {
  availabilityStatusOf,
  loadMovieAvailabilityByMovie,
  type MovieAvailability,
} from './watchable-availability';
import {localizedPosterUrl} from './localized-poster-url';
import {movieTitleColumns} from './movie-title-columns';

function posterUrlColumn() {
  return localizedPosterUrl('ja').as('posterUrl');
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

type AwardNominationRow = AwardMovieRow & {
  ceremonyYear: number;
  ceremonyNumber: number | null;
};

function toAwardMovieEntry(
  row: AwardMovieRow,
  availabilityByMovie: Map<string, MovieAvailability>,
): AwardMovieEntry {
  return {
    uid: row.movieUid,
    title: row.jaTitle ?? row.defaultTitle ?? undefined,
    movieYear: row.movieYear ?? undefined,
    posterUrl: row.posterUrl ?? undefined,
    isWinner: row.isWinner === 1,
    specialMention: row.specialMention ?? undefined,
    availabilityStatus: availabilityStatusOf(availabilityByMovie, row.movieUid),
  };
}

function summarizeMovies(
  movieUids: Iterable<string>,
  availabilityByMovie: Map<string, MovieAvailability>,
): JapanAvailabilitySummary {
  return summarizeJapanAvailability(
    new Set(movieUids)
      .values()
      .map(movieUid => availabilityStatusOf(availabilityByMovie, movieUid)),
  );
}

function compareUnavailableMovies(
  a: AwardUnavailableMovie,
  b: AwardUnavailableMovie,
): number {
  return (
    b.ceremonyYears[0] - a.ceremonyYears[0] ||
    Number(b.isWinner) - Number(a.isWinner) ||
    (a.title ?? '').localeCompare(b.title ?? '', 'ja') ||
    a.uid.localeCompare(b.uid)
  );
}

export class AwardsService extends BaseService {
  async getAwardBySlug(slug: string): Promise<AwardDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition) {
      return undefined;
    }

    const rows = await this.loadNominationRows(definition);
    if (rows.length === 0) {
      return undefined;
    }

    const availabilityByMovie = await loadMovieAvailabilityByMovie(
      this.database,
      [...new Set(rows.map(row => row.movieUid))],
    );

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

      group.movies.push(toAwardMovieEntry(row, availabilityByMovie));
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
      availabilitySummary: summarizeMovies(
        rows.map(row => row.movieUid),
        availabilityByMovie,
      ),
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
    years: number[],
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

    const availabilityByMovie = await loadMovieAvailabilityByMovie(
      this.database,
      [...new Set(rows.map(row => row.movieUid))],
    );

    const movieEntries: AwardMovieEntry[] = [];
    for (const row of rows) {
      const existing = movieEntries.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      const entry = toAwardMovieEntry(row, availabilityByMovie);
      const watchable = availabilityByMovie.get(row.movieUid)?.watchable;
      if (watchable && watchable.length > 0) {
        entry.availability = watchable;
      }

      movieEntries.push(entry);
    }

    movieEntries.sort(compareAwardMovies);

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      year,
      ceremonyNumber: rows[0].ceremonyNumber ?? undefined,
      availabilitySummary: summarizeMovies(
        movieEntries.map(movie => movie.uid),
        availabilityByMovie,
      ),
      movies: movieEntries,
      ...adjacentYears(years, year),
    };
  }

  async getAwardUnavailable(
    slug: string,
  ): Promise<AwardUnavailableList | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition) {
      return undefined;
    }

    const rows = await this.loadNominationRows(definition);
    if (rows.length === 0) {
      return undefined;
    }

    const availabilityByMovie = await loadMovieAvailabilityByMovie(
      this.database,
      [...new Set(rows.map(row => row.movieUid))],
    );

    const byUid = new Map<string, AwardUnavailableMovie>();
    for (const row of rows) {
      if (
        availabilityStatusOf(availabilityByMovie, row.movieUid) !==
        'unwatchable'
      ) {
        continue;
      }

      const existing = byUid.get(row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        if (!existing.ceremonyYears.includes(row.ceremonyYear)) {
          existing.ceremonyYears.push(row.ceremonyYear);
        }

        continue;
      }

      byUid.set(row.movieUid, {
        uid: row.movieUid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        movieYear: row.movieYear ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        isWinner: row.isWinner === 1,
        ceremonyYears: [row.ceremonyYear],
      });
    }

    const unavailableMovies = byUid.values().toArray();
    for (const movie of unavailableMovies) {
      movie.ceremonyYears.sort((a, b) => b - a);
    }

    unavailableMovies.sort(compareUnavailableMovies);

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: definition.grouping,
      ...(definition.subAward && {subAward: true}),
      availabilitySummary: summarizeMovies(
        rows.map(row => row.movieUid),
        availabilityByMovie,
      ),
      movies: unavailableMovies,
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

  private async loadNominationRows(
    definition: AwardPageDefinition,
  ): Promise<AwardNominationRow[]> {
    const categoryUids = await resolveCategoryUids(this.database, definition);
    if (categoryUids.length === 0) {
      return [];
    }

    return this.database
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
  }
}
