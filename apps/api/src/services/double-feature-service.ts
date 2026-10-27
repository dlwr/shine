import {and, eq, inArray, inChunks, isNull, ne} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {
  DoubleFeature,
  DoubleFeatureConnectionKind,
  DoubleFeatureMovie,
} from '../types/double-feature';
import {simpleHash} from '../utils/hash';
import {
  awardPageNominations,
  findTopAwardPageDefinition,
} from './award-definition-lookup';
import {BaseService} from './base-service';
import {localizedPosterUrl} from './localized-poster-url';
import {movieTitleColumns} from './movie-title-columns';
import {personLocalizedName} from './person-name';
import {pickNominatedMovieUid} from './selection-pick';
import {loadMovieAvailabilityByMovie} from './watchable-availability';

const MAX_ANCHOR_ATTEMPTS = 5;
const MAX_CANDIDATES_PER_QUERY = 200;
const CONNECTION_KINDS: DoubleFeatureConnectionKind[] = [
  'director',
  'cast',
  'category',
];

type Candidate = {
  kind: DoubleFeatureConnectionKind;
  movieUid: string;
  label: string;
};

export class DoubleFeatureService extends BaseService {
  async getDoubleFeature(date: string): Promise<DoubleFeature | undefined> {
    const seed = simpleHash(`double-feature-${date}`);
    const triedUids: string[] = [];
    for (let attempt = 0; attempt < MAX_ANCHOR_ATTEMPTS; attempt++) {
      const anchorUid = await pickNominatedMovieUid(
        this.database,
        seed,
        triedUids,
      );
      if (!anchorUid) {
        return undefined;
      }

      triedUids.push(anchorUid);
      const pair = await this.pairWith(anchorUid, seed);
      if (pair) {
        return {date, ...pair};
      }
    }

    return undefined;
  }

  private async pairWith(
    anchorUid: string,
    seed: number,
  ): Promise<Omit<DoubleFeature, 'date'> | undefined> {
    const [anchor] = await this.loadShowableMovies([anchorUid]);
    if (!anchor) {
      return undefined;
    }

    const candidates = [
      ...(await this.findPersonCandidates(anchorUid)),
      ...(await this.findCategoryCandidates(anchorUid)),
    ];
    const showableMovies = await this.loadShowableMovies(
      new Set(candidates.map(candidate => candidate.movieUid))
        .values()
        .toArray(),
    );
    const showable = new Map(showableMovies.map(movie => [movie.uid, movie]));
    const showableCandidates = candidates.filter(candidate =>
      showable.has(candidate.movieUid),
    );
    const kinds = CONNECTION_KINDS.filter(kind =>
      showableCandidates.some(candidate => candidate.kind === kind),
    );
    if (kinds.length === 0) {
      return undefined;
    }

    const kind = kinds[seed % kinds.length];
    const ofKind = showableCandidates
      .filter(candidate => candidate.kind === kind)
      .toSorted(
        (a, b) =>
          a.movieUid.localeCompare(b.movieUid) ||
          a.label.localeCompare(b.label),
      )
      .filter(
        (candidate, index, sorted) =>
          sorted[index - 1]?.movieUid !== candidate.movieUid,
      );
    const availability = await loadMovieAvailabilityByMovie(
      this.database,
      ofKind.map(candidate => candidate.movieUid),
    );
    const watchable = ofKind.filter(
      candidate => availability.get(candidate.movieUid)?.status === 'watchable',
    );
    const pool = watchable.length > 0 ? watchable : ofKind;
    const partner = pool[seed % pool.length];

    return {
      connection: {kind, label: partner.label},
      movies: [anchor, showable.get(partner.movieUid)!],
    };
  }

  private async findPersonCandidates(anchorUid: string): Promise<Candidate[]> {
    const anchorCredits = await this.database
      .select({
        personUid: movieCredits.personUid,
        job: movieCredits.job,
        department: movieCredits.department,
        name: people.name,
        localizedName: personLocalizedName('ja'),
      })
      .from(movieCredits)
      .innerJoin(people, eq(people.uid, movieCredits.personUid))
      .where(eq(movieCredits.movieUid, anchorUid));
    const directors = new Map<string, string>();
    const cast = new Map<string, string>();
    for (const credit of anchorCredits) {
      const name = credit.localizedName ?? credit.name;
      if (credit.job === 'Director') {
        directors.set(credit.personUid, name);
      } else if (credit.department === 'Acting') {
        cast.set(credit.personUid, name);
      }
    }

    const personUids = [...new Set([...directors.keys(), ...cast.keys()])];
    if (personUids.length === 0) {
      return [];
    }

    const partnerCredits = await this.database
      .select({
        personUid: movieCredits.personUid,
        movieUid: movieCredits.movieUid,
        job: movieCredits.job,
        department: movieCredits.department,
      })
      .from(movieCredits)
      .innerJoin(movies, eq(movies.uid, movieCredits.movieUid))
      .where(
        and(
          inArray(movieCredits.personUid, personUids),
          ne(movieCredits.movieUid, anchorUid),
          isNull(movies.deletedAt),
        ),
      )
      .orderBy(movieCredits.movieUid, movieCredits.personUid)
      .limit(MAX_CANDIDATES_PER_QUERY);

    const candidates: Candidate[] = [];
    for (const credit of partnerCredits) {
      const directorName = directors.get(credit.personUid);
      const castName = cast.get(credit.personUid);
      if (directorName && credit.job === 'Director') {
        candidates.push({
          kind: 'director',
          movieUid: credit.movieUid,
          label: `どちらも${directorName}が監督`,
        });
      } else if (castName && credit.department === 'Acting') {
        candidates.push({
          kind: 'cast',
          movieUid: credit.movieUid,
          label: `${castName}が両方に出演`,
        });
      }
    }

    return candidates;
  }

  private async findCategoryCandidates(
    anchorUid: string,
  ): Promise<Candidate[]> {
    const anchorCategories = await this.database
      .select({
        categoryUid: nominations.categoryUid,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
      })
      .from(nominations)
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
      .where(
        and(
          eq(nominations.movieUid, anchorUid),
          isNull(nominations.personUid),
          awardPageNominations(),
        ),
      );
    const labels = new Map<string, string>();
    for (const category of anchorCategories) {
      const definition = findTopAwardPageDefinition(
        category.organizationName,
        category.categoryName,
      );
      if (definition) {
        labels.set(
          category.categoryUid,
          `どちらも${definition.organization} ${definition.name}の候補`,
        );
      }
    }

    if (labels.size === 0) {
      return [];
    }

    const partnerNominations = await this.database
      .select({
        categoryUid: nominations.categoryUid,
        movieUid: nominations.movieUid,
      })
      .from(nominations)
      .innerJoin(movies, eq(movies.uid, nominations.movieUid))
      .where(
        and(
          inArray(nominations.categoryUid, labels.keys().toArray()),
          isNull(nominations.personUid),
          ne(nominations.movieUid, anchorUid),
          isNull(movies.deletedAt),
        ),
      )
      .orderBy(nominations.movieUid, nominations.categoryUid)
      .limit(MAX_CANDIDATES_PER_QUERY);

    return partnerNominations.map(nomination => ({
      kind: 'category',
      movieUid: nomination.movieUid,
      label: labels.get(nomination.categoryUid)!,
    }));
  }

  private async loadShowableMovies(
    movieUids: string[],
  ): Promise<DoubleFeatureMovie[]> {
    if (movieUids.length === 0) {
      return [];
    }

    const rows = await inChunks(movieUids, chunk =>
      this.database
        .select({
          uid: movies.uid,
          year: movies.year,
          jaTitle: movieTitleColumns().jaTitle,
          posterUrl: localizedPosterUrl('ja').as('posterUrl'),
        })
        .from(movies)
        .where(and(inArray(movies.uid, chunk), isNull(movies.deletedAt))),
    );

    const showable: DoubleFeatureMovie[] = [];
    for (const uid of movieUids) {
      const row = rows.find(current => current.uid === uid);
      if (row?.jaTitle && row.posterUrl) {
        showable.push({
          uid,
          title: row.jaTitle,
          year: row.year ?? undefined,
          posterUrl: row.posterUrl,
        });
      }
    }

    return showable;
  }
}
