import {and, eq} from '@shine/database';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {BaseService} from './base-service';

export class AdminPostersService extends BaseService {
  async addPoster(
    movieId: string,
    posterData: {
      url: string;
      width?: number;
      height?: number;
      language?: string;
      source?: string;
      isPrimary?: boolean;
    },
  ) {
    const {
      url,
      width,
      height,
      language = 'en',
      source = 'manual',
      isPrimary = false,
    } = posterData;

    if (isPrimary) {
      await this.database
        .update(posterUrls)
        .set({isPrimary: 0})
        .where(eq(posterUrls.movieUid, movieId));
    }

    const [newPoster] = await this.database
      .insert(posterUrls)
      .values({
        movieUid: movieId,
        url,
        width,
        height,
        languageCode: language,
        sourceType: source,
        isPrimary: isPrimary ? 1 : 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    return newPoster;
  }

  async deletePoster(movieId: string, posterId: string): Promise<void> {
    await this.database
      .delete(posterUrls)
      .where(
        and(eq(posterUrls.uid, posterId), eq(posterUrls.movieUid, movieId)),
      );
  }
}
