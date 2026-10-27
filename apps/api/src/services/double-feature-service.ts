import type {
  DoubleFeature,
  DoubleFeatureConnectionKind,
} from '../types/double-feature';
import {simpleHash} from '../utils/hash';
import {BaseService} from './base-service';
import {
  findMovieConnections,
  loadShowableMovies,
  type MovieConnection,
} from './movie-connections';
import {pickNominatedMovieUid} from './selection-pick';
import {loadMovieAvailabilityByMovie} from './watchable-availability';

const MAX_ANCHOR_ATTEMPTS = 5;
const CONNECTION_KINDS: DoubleFeatureConnectionKind[] = [
  'director',
  'cast',
  'category',
];

function doubleFeatureLabel({kind, name}: MovieConnection): string {
  switch (kind) {
    case 'director': {
      return `どちらも${name}が監督`;
    }

    case 'cast': {
      return `${name}が両方に出演`;
    }

    case 'category': {
      return `どちらも${name}の候補`;
    }
  }
}

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
    const [anchor] = await loadShowableMovies(this.database, [anchorUid]);
    if (!anchor) {
      return undefined;
    }

    const connections = await findMovieConnections(this.database, [anchorUid]);
    const candidates = connections.map(connection => ({
      kind: connection.kind,
      movieUid: connection.movieUid,
      label: doubleFeatureLabel(connection),
    }));
    const showableMovies = await loadShowableMovies(
      this.database,
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
}
