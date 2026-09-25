import {and, eq, isNull, runBatch} from '@shine/database';
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

    const now = Math.floor(Date.now() / 1000);
    const existingTitle = await this.findTranslationUid(
      movieId,
      'movie_title',
      languageCode,
    );
    const existingDescription = description
      ? await this.findTranslationUid(
          movieId,
          'movie_description',
          languageCode,
        )
      : undefined;

    const clearDefault = this.database
      .update(translations)
      .set({isDefault: 0})
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_title'),
        ),
      );
    const saveTitle = existingTitle
      ? this.database
          .update(translations)
          .set({content: title, isDefault: isDefault ? 1 : 0})
          .where(eq(translations.uid, existingTitle))
      : this.database.insert(translations).values({
          resourceType: 'movie_title',
          resourceUid: movieId,
          languageCode,
          content: title,
          isDefault: isDefault ? 1 : 0,
          createdAt: now,
        });
    const saveDescription = description
      ? [
          existingDescription
            ? this.database
                .update(translations)
                .set({content: description})
                .where(eq(translations.uid, existingDescription))
            : this.database.insert(translations).values({
                resourceType: 'movie_description',
                resourceUid: movieId,
                languageCode,
                content: description,
                createdAt: now,
              }),
        ]
      : [];

    await runBatch(this.database, [
      ...(isDefault ? [clearDefault] : []),
      saveTitle,
      ...saveDescription,
    ]);
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

  private async findTranslationUid(
    movieId: string,
    resourceType: 'movie_title' | 'movie_description',
    languageCode: string,
  ): Promise<string | undefined> {
    const row = await this.database
      .select({uid: translations.uid})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, resourceType),
          eq(translations.languageCode, languageCode),
        ),
      )
      .get();
    return row?.uid;
  }
}
