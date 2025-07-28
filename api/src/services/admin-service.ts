import {and, eq, not, sql} from 'db';
import {articleLinks} from 'db/schema/article-links';
import {awardCategories} from 'db/schema/award-categories';
import {awardCeremonies} from 'db/schema/award-ceremonies';
import {awardOrganizations} from 'db/schema/award-organizations';
import {movieSelections} from 'db/schema/movie-selections';
import {movies} from 'db/schema/movies';
import {nominations} from 'db/schema/nominations';
import {posterUrls} from 'db/schema/poster-urls';
import {referenceUrls} from 'db/schema/reference-urls';
import {translations} from 'db/schema/translations';
import type {TMDBMovieData} from '../../../scrapers/src/common/tmdb-utilities';
import {BaseService} from './base-service';
import type {
	MergeMoviesOptions,
	PaginationOptions,
	UpdateIMDBIdOptions,
} from './types';

export class AdminService extends BaseService {
	async getMovies(options: PaginationOptions & {search?: string}) {
		const {page, limit, search} = options;
		const offset = (page - 1) * limit;

		if (search) {
			// Search across both Japanese and English titles
			const searchPattern = `%${search}%`;

			// Use CTE to get all movies that match either Japanese or English titles
			const searchQuery = this.database
				.select({
					uid: movies.uid,
					year: movies.year,
					originalLanguage: movies.originalLanguage,
					imdbId: movies.imdbId,
					jaTitle: sql`
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'ja'
							LIMIT 1
						)
					`.as('jaTitle'),
					enTitle: sql`
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'en'
							LIMIT 1
						)
					`.as('enTitle'),
					posterUrl: sql`
						(
							SELECT url
							FROM poster_urls
							WHERE poster_urls.movie_uid = movies.uid
							LIMIT 1
						)
					`.as('posterUrl'),
					nominationCount: sql`
						(
							SELECT COUNT(*)
							FROM nominations
							WHERE nominations.movie_uid = movies.uid
						)
					`.as('nominationCount'),
				})
				.from(movies)
				.where(
					sql`EXISTS (
						SELECT 1 FROM translations 
						WHERE translations.resource_uid = movies.uid
						AND translations.resource_type = 'movie_title'
						AND translations.content LIKE ${searchPattern}
					)`,
				)
				.orderBy(sql`${movies.createdAt} DESC`)
				.limit(limit)
				.offset(offset);

			const allMovies = await searchQuery;

			// Count total matching movies
			const totalCountResult = await this.database
				.select({count: sql`COUNT(*)`.as('count')})
				.from(movies)
				.where(
					sql`EXISTS (
						SELECT 1 FROM translations 
						WHERE translations.resource_uid = movies.uid
						AND translations.resource_type = 'movie_title'
						AND translations.content LIKE ${searchPattern}
					)`,
				);

			const totalCount = Number(totalCountResult[0]?.count) || 0;
			const totalPages = Math.ceil(totalCount / limit);

			// Format the results to prefer Japanese title but fall back to English
			const formattedMovies = allMovies.map((movie) => ({
				uid: movie.uid,
				year: movie.year,
				originalLanguage: movie.originalLanguage,
				imdbId: movie.imdbId,
				title: movie.jaTitle || movie.enTitle || 'Untitled',
				posterUrl: movie.posterUrl,
				nominationCount: movie.nominationCount,
			}));

			return {
				movies: formattedMovies,
				pagination: {
					currentPage: page,
					totalPages,
					totalCount,
					hasNext: page < totalPages,
					hasPrev: page > 1,
				},
			};
		}

		// No search - return all movies with Japanese titles preferred
		const baseQuery = this.database
			.select({
				uid: movies.uid,
				year: movies.year,
				originalLanguage: movies.originalLanguage,
				imdbId: movies.imdbId,
				title: sql`
					COALESCE(
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'ja'
							LIMIT 1
						),
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'en'
							LIMIT 1
						),
						'Untitled'
					)
				`.as('title'),
				posterUrl: sql`
					(
						SELECT url
						FROM poster_urls
						WHERE poster_urls.movie_uid = movies.uid
						LIMIT 1
					)
				`.as('posterUrl'),
				nominationCount: sql`
					(
						SELECT COUNT(*)
						FROM nominations
						WHERE nominations.movie_uid = movies.uid
					)
				`.as('nominationCount'),
			})
			.from(movies);

		const allMovies = await baseQuery
			.orderBy(sql`${movies.createdAt} DESC`)
			.limit(limit)
			.offset(offset);

		const totalCountResult = await this.database
			.select({count: sql`COUNT(*)`.as('count')})
			.from(movies);

		const totalCount = Number(totalCountResult[0]?.count) || 0;
		const totalPages = Math.ceil(totalCount / limit);

		return {
			movies: allMovies,
			pagination: {
				currentPage: page,
				totalPages,
				totalCount,
				hasNext: page < totalPages,
				hasPrev: page > 1,
			},
		};
	}

	async deleteMovie(movieId: string): Promise<void> {
		await this.database.transaction(async (trx) => {
			await trx.delete(articleLinks).where(eq(articleLinks.movieUid, movieId));
			await trx
				.delete(movieSelections)
				.where(eq(movieSelections.movieId, movieId));
			await trx.delete(nominations).where(eq(nominations.movieUid, movieId));
			await trx
				.delete(referenceUrls)
				.where(eq(referenceUrls.movieUid, movieId));
			await trx
				.delete(translations)
				.where(eq(translations.resourceUid, movieId));
			await trx.delete(posterUrls).where(eq(posterUrls.movieUid, movieId));
			await trx.delete(movies).where(eq(movies.uid, movieId));
		});
	}

	async getMovieForAdmin(movieId: string) {
		// Get basic movie info
		const movieResult = await this.database
			.select({
				uid: movies.uid,
				year: movies.year,
				originalLanguage: movies.originalLanguage,
				imdbId: movies.imdbId,
				tmdbId: movies.tmdbId,
			})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movieResult.length === 0) {
			throw new Error('Movie not found');
		}

		const movie = movieResult[0];

		// Get all translations
		const translationsResult = await this.database
			.select({
				languageCode: translations.languageCode,
				content: translations.content,
				isDefault: translations.isDefault,
			})
			.from(translations)
			.where(
				and(
					eq(translations.resourceUid, movieId),
					eq(translations.resourceType, 'movie_title'),
				),
			)
			.orderBy(translations.languageCode);

		// Get all posters
		const postersResult = await this.database
			.select({
				uid: posterUrls.uid,
				url: posterUrls.url,
				width: posterUrls.width,
				height: posterUrls.height,
				languageCode: posterUrls.languageCode,
				sourceType: posterUrls.sourceType,
				isPrimary: posterUrls.isPrimary,
			})
			.from(posterUrls)
			.where(eq(posterUrls.movieUid, movieId))
			.orderBy(posterUrls.isPrimary, posterUrls.createdAt);

		// Get nominations with full details
		const nominationsResult = await this.database
			.select({
				uid: nominations.uid,
				isWinner: nominations.isWinner,
				specialMention: nominations.specialMention,
				categoryUid: awardCategories.uid,
				categoryName: awardCategories.name,
				ceremonyUid: awardCeremonies.uid,
				ceremonyNumber: awardCeremonies.ceremonyNumber,
				ceremonyYear: awardCeremonies.year,
				organizationUid: awardOrganizations.uid,
				organizationName: awardOrganizations.name,
				organizationShortName: awardOrganizations.shortName,
			})
			.from(nominations)
			.innerJoin(
				awardCategories,
				eq(awardCategories.uid, nominations.categoryUid),
			)
			.innerJoin(
				awardCeremonies,
				eq(awardCeremonies.uid, nominations.ceremonyUid),
			)
			.innerJoin(
				awardOrganizations,
				eq(awardOrganizations.uid, awardCeremonies.organizationUid),
			)
			.where(eq(nominations.movieUid, movieId))
			.orderBy(awardCeremonies.year, awardCategories.name);

		// Get article links
		const articleLinksResult = await this.database
			.select({
				uid: articleLinks.uid,
				url: articleLinks.url,
				title: articleLinks.title,
				description: articleLinks.description,
				isSpam: articleLinks.isSpam,
			})
			.from(articleLinks)
			.where(eq(articleLinks.movieUid, movieId))
			.orderBy(sql`${articleLinks.submittedAt} DESC`);

		return {
			uid: movie.uid,
			year: movie.year,
			originalLanguage: movie.originalLanguage,
			imdbId: movie.imdbId,
			tmdbId: movie.tmdbId,
			translations: translationsResult,
			posters: postersResult,
			nominations: nominationsResult.map((nom) => ({
				uid: nom.uid,
				isWinner: Boolean(nom.isWinner),
				specialMention: nom.specialMention,
				category: {
					uid: nom.categoryUid,
					name: nom.categoryName,
				},
				ceremony: {
					uid: nom.ceremonyUid,
					number: nom.ceremonyNumber!,
					year: nom.ceremonyYear,
				},
				organization: {
					uid: nom.organizationUid,
					name: nom.organizationName,
					shortName: nom.organizationShortName!,
				},
			})),
			articleLinks: articleLinksResult,
		};
	}

	async updateIMDbId(
		movieId: string,
		options: UpdateIMDBIdOptions,
	): Promise<{
		tmdbId?: number;
		postersAdded: number;
		translationsAdded: number;
	}> {
		const {imdbId, fetchTMDBData = false} = options;

		// Validate IMDb ID format (can be empty for removal)
		if (imdbId && !/^tt\d+$/.test(imdbId)) {
			throw new Error('Invalid IMDb ID format');
		}

		// Check if movie exists
		const movieExists = await this.database
			.select({uid: movies.uid})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movieExists.length === 0) {
			throw new Error('Movie not found');
		}

		// Check for duplicate IMDb ID if setting one
		if (imdbId) {
			const existingMovie = await this.database
				.select({uid: movies.uid})
				.from(movies)
				.where(and(eq(movies.imdbId, imdbId), not(eq(movies.uid, movieId))))
				.limit(1);

			if (existingMovie.length > 0) {
				throw new Error('IMDb ID already exists for another movie');
			}
		}

		let tmdbId: number | undefined;
		let postersAdded = 0;
		let translationsAdded = 0;

		if (fetchTMDBData) {
			try {
				const tmdbData = await this.fetchTMDBDataByImdbId(imdbId);
				if (tmdbData) {
					tmdbId = tmdbData.tmdbId;
					postersAdded = await this.addPostersFromTMDB(movieId, tmdbData.movie);
					translationsAdded = await this.addTranslationsFromTMDB(
						movieId,
						tmdbData.movie,
					);
				}
			} catch (error) {
				console.error('Failed to fetch TMDB data:', error);
			}
		}

		await this.database
			.update(movies)
			.set({
				imdbId,
				...(tmdbId && {tmdbId}),
				updatedAt: Math.floor(Date.now() / 1000),
			})
			.where(eq(movies.uid, movieId));

		return {tmdbId, postersAdded, translationsAdded};
	}

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
				updatedAt: Math.floor(Date.now() / 1000),
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

	async flagArticleAsSpam(articleId: string): Promise<void> {
		await this.database
			.update(articleLinks)
			.set({isSpam: true})
			.where(eq(articleLinks.uid, articleId));
	}

	async deleteArticleLink(articleId: string): Promise<void> {
		await this.database
			.delete(articleLinks)
			.where(eq(articleLinks.uid, articleId));
	}

	async mergeMovies(options: MergeMoviesOptions): Promise<void> {
		const {
			sourceMovieId,
			targetMovieId,
			preserveTranslations = true,
			preservePosters = true,
		} = options;

		if (sourceMovieId === targetMovieId) {
			throw new Error('Cannot merge a movie with itself');
		}

		await this.database.transaction(async (trx) => {
			// Merge nominations
			await trx
				.update(nominations)
				.set({
					movieUid: targetMovieId,
					updatedAt: Math.floor(Date.now() / 1000),
				})
				.where(eq(nominations.movieUid, sourceMovieId));

			// Merge movie selections
			await trx
				.update(movieSelections)
				.set({
					movieId: targetMovieId,
					updatedAt: Math.floor(Date.now() / 1000),
				})
				.where(eq(movieSelections.movieId, sourceMovieId));

			// Merge article links
			await trx
				.update(articleLinks)
				.set({movieUid: targetMovieId})
				.where(eq(articleLinks.movieUid, sourceMovieId));

			// Merge reference URLs
			await trx
				.update(referenceUrls)
				.set({
					movieUid: targetMovieId,
					updatedAt: Math.floor(Date.now() / 1000),
				})
				.where(eq(referenceUrls.movieUid, sourceMovieId));

			// Update or delete translations based on preserveTranslations flag
			void (preserveTranslations
				? await trx
						.update(translations)
						.set({
							resourceUid: targetMovieId,
							updatedAt: Math.floor(Date.now() / 1000),
						})
						.where(eq(translations.resourceUid, sourceMovieId))
				: await trx
						.delete(translations)
						.where(eq(translations.resourceUid, sourceMovieId)));

			// Update or delete posters based on preservePosters flag
			void (preservePosters
				? await trx
						.update(posterUrls)
						.set({
							movieUid: targetMovieId,
							updatedAt: Math.floor(Date.now() / 1000),
						})
						.where(eq(posterUrls.movieUid, sourceMovieId))
				: await trx
						.delete(posterUrls)
						.where(eq(posterUrls.movieUid, sourceMovieId)));

			// Delete the source movie
			await trx.delete(movies).where(eq(movies.uid, sourceMovieId));
		});
	}

	private async fetchTMDBDataByImdbId(imdbId: string): Promise<
		| {
				tmdbId: number;
				movie: TMDBMovieData;
		  }
		| undefined
	> {
		const apiKey = this.env.TMDB_API_KEY;
		if (!apiKey) {
			throw new Error('TMDB API key not configured');
		}

		// Find TMDb ID from IMDb ID
		const findResponse = await fetch(
			`https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`,
		);

		if (!findResponse.ok) {
			throw new Error(`TMDB API error: ${findResponse.statusText}`);
		}

		const findData = (await findResponse.json()) as {
			movie_results?: Array<{id: number}>;
		};
		if (!findData.movie_results || findData.movie_results.length === 0) {
			return undefined;
		}

		const tmdbId = findData.movie_results[0].id;

		// Get detailed movie data with translations
		const movieResponse = await fetch(
			`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=translations`,
		);

		if (!movieResponse.ok) {
			throw new Error(`TMDB API error: ${movieResponse.statusText}`);
		}

		const movieData = (await movieResponse.json()) as TMDBMovieData;

		return {
			tmdbId,
			movie: movieData,
		};
	}

	private async addPostersFromTMDB(
		movieId: string,
		tmdbData: TMDBMovieData,
	): Promise<number> {
		if (!tmdbData.poster_path) return 0;

		const url = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;

		// Check if this poster already exists
		const existingPoster = await this.database
			.select({uid: posterUrls.uid})
			.from(posterUrls)
			.where(and(eq(posterUrls.movieUid, movieId), eq(posterUrls.url, url)))
			.limit(1);

		if (existingPoster.length > 0) return 0;

		await this.database.insert(posterUrls).values({
			movieUid: movieId,
			url,
			width: 500,
			height: 750,
			languageCode: 'en',
			sourceType: 'tmdb',
			isPrimary: 0,
			createdAt: Math.floor(Date.now() / 1000),
			updatedAt: Math.floor(Date.now() / 1000),
		});

		return 1;
	}

	private async addTranslationsFromTMDB(
		movieId: string,
		tmdbData: TMDBMovieData,
	): Promise<number> {
		let addedCount = 0;

		console.log('TMDb data received:', JSON.stringify(tmdbData, null, 2));
		console.log('Translations:', tmdbData.translations);

		if (tmdbData.translations?.translations) {
			console.log(`Found ${tmdbData.translations.translations.length} translations`);
			for (const translation of tmdbData.translations.translations) {
				console.log(`Processing translation: ${translation.iso_639_1}, title: ${translation.data?.title}`);
				if (translation.iso_639_1 && translation.data?.title) {
					// Check if translation already exists for this language
					const existingTranslation = await this.database
						.select({uid: translations.uid})
						.from(translations)
						.where(
							and(
								eq(translations.resourceUid, movieId),
								eq(translations.resourceType, 'movie_title'),
								eq(translations.languageCode, translation.iso_639_1),
							),
						)
						.limit(1);

					if (existingTranslation.length === 0) {
						console.log(`Adding translation for ${translation.iso_639_1}: ${translation.data.title}`);
						await this.database.insert(translations).values({
							resourceType: 'movie_title',
							resourceUid: movieId,
							languageCode: translation.iso_639_1,
							content: translation.data.title,
							createdAt: Math.floor(Date.now() / 1000),
							updatedAt: Math.floor(Date.now() / 1000),
						});
						addedCount++;
					} else {
						console.log(`Translation already exists for ${translation.iso_639_1}`);
					}
				}
			}
		} else {
			console.log('No translations found in TMDb data');
		}

		console.log(`Total translations added: ${addedCount}`);
		return addedCount;
	}
}
