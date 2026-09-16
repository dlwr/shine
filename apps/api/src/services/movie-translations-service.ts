import {and, eq, isNull} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {BaseService} from './base-service';
import {NotFoundError} from './errors';

export class MovieTranslationsService extends BaseService {
  async addMovieTranslation(
    movieId: string,
    languageCode: string,
    title: string,
    isDefault = false,
    description?: string,
  ): Promise<void> {
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    await this.database.transaction(async trx => {
      const now = Math.floor(Date.now() / 1000);

      if (isDefault) {
        await trx
          .update(translations)
          .set({isDefault: 0})
          .where(
            and(
              eq(translations.resourceUid, movieId),
              eq(translations.resourceType, 'movie_title'),
            ),
          );
      }

      const existingTitle = await trx
        .select({uid: translations.uid})
        .from(translations)
        .where(
          and(
            eq(translations.resourceUid, movieId),
            eq(translations.resourceType, 'movie_title'),
            eq(translations.languageCode, languageCode),
          ),
        )
        .limit(1);

      await (existingTitle.length > 0
        ? trx
            .update(translations)
            .set({content: title, isDefault: isDefault ? 1 : 0})
            .where(eq(translations.uid, existingTitle[0].uid))
        : trx.insert(translations).values({
            resourceType: 'movie_title',
            resourceUid: movieId,
            languageCode,
            content: title,
            isDefault: isDefault ? 1 : 0,
            createdAt: now,
          }));

      if (!description) {
        return;
      }

      const existingDescription = await trx
        .select({uid: translations.uid})
        .from(translations)
        .where(
          and(
            eq(translations.resourceUid, movieId),
            eq(translations.resourceType, 'movie_description'),
            eq(translations.languageCode, languageCode),
          ),
        )
        .limit(1);

      await (existingDescription.length > 0
        ? trx
            .update(translations)
            .set({content: description})
            .where(eq(translations.uid, existingDescription[0].uid))
        : trx.insert(translations).values({
            resourceType: 'movie_description',
            resourceUid: movieId,
            languageCode,
            content: description,
            createdAt: now,
          }));
    });
  }

  async deleteMovieTranslation(
    movieId: string,
    languageCode: string,
    resourceType: 'movie_title' | 'movie_description' = 'movie_title',
  ): Promise<void> {
    await this.database
      .delete(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, resourceType),
          eq(translations.languageCode, languageCode),
        ),
      );
  }
}
