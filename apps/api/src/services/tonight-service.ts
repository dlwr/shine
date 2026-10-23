import {between} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import type {AwardTaggedMovie} from '../types/award-tagged-movies';
import {loadAwardTaggedMovies} from './award-tagged-movies';
import {BaseService} from './base-service';

export class TonightService extends BaseService {
  async listPool(maxRuntime: number): Promise<AwardTaggedMovie[]> {
    const result = await loadAwardTaggedMovies(
      this.database,
      between(movies.runtime, 1, maxRuntime),
    );
    return result.movies;
  }
}
