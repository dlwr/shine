import {and, eq, getDatabase, not, sql, type Environment} from 'db';
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
import {Hono} from 'hono';
import {authMiddleware} from '../auth';
import {sanitizeText} from '../middleware/sanitizer';
import {AdminService} from '../services';

type MovieDatabaseTranslation = {
	iso_639_1: string;
	data?: {
		title?: string;
	};
};

export const adminRoutes = new Hono<{Bindings: Environment}>();

// Get movie details for admin with all translations, posters, and nominations
adminRoutes.get('/movies/:id', authMiddleware, async (c) => {
	try {
		const adminService = new AdminService(c.env);
		const movieId = c.req.param('id');

		const movieDetails = await adminService.getMovieForAdmin(movieId);

		return c.json(movieDetails);
	} catch (error) {
		console.error('Error fetching movie details for admin:', error);

		if (error instanceof Error && error.message === 'Movie not found') {
			return c.json({error: 'Movie not found'}, 404);
		}

		return c.json({error: 'Internal server error'}, 500);
	}
});

// Get all movies for admin
adminRoutes.get('/movies', authMiddleware, async (c) => {
	try {
		const adminService = new AdminService(c.env);
		const page = Number(c.req.query('page') || 1);
		const limit = Math.min(Number(c.req.query('limit') || 50), 100);
		const rawSearch = c.req.query('search');
		const search = rawSearch ? sanitizeText(rawSearch) : undefined;

		const result = await adminService.getMovies({page, limit, search});

		return c.json({
			movies: result.movies.map((movie) => ({
				uid: movie.uid,
				year: movie.year,
				originalLanguage: movie.originalLanguage,
				imdbId: movie.imdbId,
				title: movie.title || 'Untitled',
				posterUrl: movie.posterUrl,
				imdbUrl: movie.imdbId
					? `https://www.imdb.com/title/${movie.imdbId}/`
					: undefined,
			})),
			pagination: {
				page: result.pagination.currentPage,
				limit,
				totalCount: result.pagination.totalCount,
				totalPages: result.pagination.totalPages,
			},
		});
	} catch (error) {
		console.error('Error fetching movies list:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Delete movie
adminRoutes.delete('/movies/:id', authMiddleware, async (c) => {
	try {
		const adminService = new AdminService(c.env);
		const movieId = c.req.param('id');

		await adminService.deleteMovie(movieId);

		return c.json({success: true});
	} catch (error) {
		console.error('Error deleting movie:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Flag article as spam
adminRoutes.post('/article-links/:id/spam', authMiddleware, async (c) => {
	try {
		const adminService = new AdminService(c.env);
		const articleId = c.req.param('id');

		await adminService.flagArticleAsSpam(articleId);

		return c.json({success: true});
	} catch (error) {
		console.error('Error flagging article as spam:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Add poster URL
adminRoutes.post('/movies/:id/posters', authMiddleware, async (c) => {
	try {
		const adminService = new AdminService(c.env);
		const movieId = c.req.param('id');
		const {
			url,
			width,
			height,
			languageCode,
			isPrimary = false,
		} = await c.req.json();

		// Validate inputs
		if (!url) {
			return c.json({error: 'URL is required'}, 400);
		}

		// Basic URL validation
		try {
			const _ = new URL(url);
		} catch {
			return c.json({error: 'Invalid URL format'}, 400);
		}

		const newPoster = await adminService.addPoster(movieId, {
			url,
			width,
			height,
			language: languageCode,
			source: 'manual',
			isPrimary,
		});

		return c.json(newPoster);
	} catch (error) {
		console.error('Error adding poster:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Delete poster URL
adminRoutes.delete(
	'/movies/:movieId/posters/:posterId',
	authMiddleware,
	async (c) => {
		try {
			const adminService = new AdminService(c.env);
			const movieId = c.req.param('movieId');
			const posterId = c.req.param('posterId');

			await adminService.deletePoster(movieId, posterId);

			return c.json({success: true});
		} catch (error) {
			console.error('Error deleting poster:', error);
			return c.json({error: 'Internal server error'}, 500);
		}
	},
);

// Update movie basic info (year, original language)
adminRoutes.put('/movies/:id', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const movieId = c.req.param('id');
		const {year, originalLanguage} = await c.req.json();

		// Check if movie exists
		const movieExists = await database
			.select({uid: movies.uid})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movieExists.length === 0) {
			return c.json({error: 'Movie not found'}, 404);
		}

		const updateData: any = {
			updatedAt: Math.floor(Date.now() / 1000),
		};

		// Validate year if provided
		if (year !== undefined) {
			if (
				year !== null &&
				(!Number.isInteger(year) || year < 1888 || year > 2100)
			) {
				return c.json(
					{error: 'Year must be a valid integer between 1888 and 2100'},
					400,
				);
			}

			updateData.year = year;
		}

		// Validate original language if provided
		if (originalLanguage !== undefined) {
			if (originalLanguage && typeof originalLanguage !== 'string') {
				return c.json({error: 'Original language must be a string'}, 400);
			}

			if (originalLanguage && originalLanguage.length !== 2) {
				return c.json(
					{error: 'Original language must be a 2-letter ISO 639-1 code'},
					400,
				);
			}

			updateData.originalLanguage = originalLanguage || 'en';
		}

		// Update movie
		await database
			.update(movies)
			.set(updateData)
			.where(eq(movies.uid, movieId));

		return c.json({success: true});
	} catch (error) {
		console.error('Error updating movie:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Update movie IMDB ID
adminRoutes.put('/movies/:id/imdb-id', authMiddleware, async (c) => {
	try {
		const adminService = new AdminService(c.env);
		const movieId = c.req.param('id');
		const {imdbId, refreshData = false} = await c.req.json();

		const refreshResults = await adminService.updateIMDbId(movieId, {
			imdbId,
			fetchTMDBData: refreshData,
		});

		return c.json({
			success: true,
			refreshResults: refreshData ? refreshResults : undefined,
		});
	} catch (error) {
		console.error('Error updating IMDB ID:', error);

		if (error instanceof Error) {
			if (error.message === 'Movie not found') {
				return c.json({error: 'Movie not found'}, 404);
			}

			if (error.message === 'Invalid IMDb ID format') {
				return c.json({error: "IMDB ID must be in format 'tt1234567'"}, 400);
			}

			if (error.message === 'IMDb ID already exists for another movie') {
				return c.json({error: 'IMDB ID is already used by another movie'}, 409);
			}
		}

		return c.json({error: 'Internal server error'}, 500);
	}
});

// Update movie TMDb ID
adminRoutes.put('/movies/:id/tmdb-id', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const movieId = c.req.param('id');
		const {tmdbId, refreshData = false} = await c.req.json();

		// Validate TMDb ID (must be a positive integer)
		if (
			tmdbId !== null &&
			tmdbId !== undefined &&
			(!Number.isInteger(tmdbId) || tmdbId <= 0)
		) {
			return c.json({error: 'TMDb ID must be a positive integer'}, 400);
		}

		// Check if movie exists
		const movieExists = await database
			.select({uid: movies.uid, imdbId: movies.imdbId})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movieExists.length === 0) {
			return c.json({error: 'Movie not found'}, 404);
		}

		// Check if TMDb ID is already used by another movie
		if (tmdbId) {
			const existingMovie = await database
				.select({uid: movies.uid})
				.from(movies)
				.where(and(eq(movies.tmdbId, tmdbId), not(eq(movies.uid, movieId))))
				.limit(1);

			if (existingMovie.length > 0) {
				return c.json({error: 'TMDb ID is already used by another movie'}, 409);
			}
		}

		// Update TMDb ID
		await database
			.update(movies)
			.set({
				tmdbId: tmdbId || undefined,
				updatedAt: Math.floor(Date.now() / 1000),
			})
			.where(eq(movies.uid, movieId));

		// If refreshData is true and tmdbId is provided, fetch additional data from TMDb
		const refreshResults = {
			postersAdded: 0,
			translationsAdded: 0,
		};

		if (refreshData && tmdbId && c.env.TMDB_API_KEY) {
			try {
				// Import TMDb utilities
				const {fetchTMDBMovieTranslations, savePosterUrls} = await import(
					'../../../scrapers/src/common/tmdb-utilities'
				);

				type TMDBMovieImages = {
					id: number;
					posters: Array<{
						file_path: string;
						width: number;
						height: number;
						iso_639_1: string | undefined;
					}>;
				};

				// Fetch and save posters using TMDb ID directly
				const imagesUrl = new URL(
					`https://api.themoviedb.org/3/movie/${tmdbId}/images`,
				);
				imagesUrl.searchParams.append('api_key', c.env.TMDB_API_KEY);

				const imagesResponse = await fetch(imagesUrl.toString());
				if (imagesResponse.ok) {
					const images = (await imagesResponse.json()) as TMDBMovieImages;
					if (images.posters && images.posters.length > 0) {
						const savedPosters = await savePosterUrls(
							movieId,
							images.posters,
							c.env,
						);
						refreshResults.postersAdded = savedPosters;
					}
				}

				// Fetch and save translations using TMDb Translations API
				let translationsAdded = 0;
				const database = getDatabase(c.env);
				const {translations} = await import('../../../src/schema/translations');

				// Get all translations from TMDb
				const translationsData = await fetchTMDBMovieTranslations(
					tmdbId,
					c.env.TMDB_API_KEY,
				);

				console.log(
					`Translations data for TMDb ID ${tmdbId}:`,
					translationsData?.translations?.length || 0,
					'translations found',
				);

				if (translationsData?.translations) {
					// Find English title (original language)
					const englishTranslation = translationsData.translations.find(
						(t: MovieDatabaseTranslation) =>
							t.iso_639_1 === 'en' && t.data?.title,
					);

					if (englishTranslation?.data?.title) {
						await database
							.insert(translations)
							.values({
								resourceType: 'movie_title',
								resourceUid: movieId,
								languageCode: 'en',
								content: englishTranslation.data.title,
								isDefault: 1,
							})
							.onConflictDoUpdate({
								target: [
									translations.resourceType,
									translations.resourceUid,
									translations.languageCode,
								],
								set: {
									content: englishTranslation.data.title,
									updatedAt: Math.floor(Date.now() / 1000),
								},
							});
						translationsAdded++;
						console.log(
							`Saved English title: ${englishTranslation.data.title}`,
						);
					}

					// Find Japanese title
					const japaneseTranslation = translationsData.translations.find(
						(t: MovieDatabaseTranslation) =>
							t.iso_639_1 === 'ja' && t.data?.title,
					);

					if (japaneseTranslation?.data?.title) {
						await database
							.insert(translations)
							.values({
								resourceType: 'movie_title',
								resourceUid: movieId,
								languageCode: 'ja',
								content: japaneseTranslation.data.title,
								isDefault: 0,
							})
							.onConflictDoUpdate({
								target: [
									translations.resourceType,
									translations.resourceUid,
									translations.languageCode,
								],
								set: {
									content: japaneseTranslation.data.title,
									updatedAt: Math.floor(Date.now() / 1000),
								},
							});
						translationsAdded++;
						console.log(
							`Saved Japanese title: ${japaneseTranslation.data.title}`,
						);
					}
				}

				refreshResults.translationsAdded = translationsAdded;
			} catch (refreshError) {
				console.warn('Error during data refresh:', refreshError);
				// Continue without failing the main operation
			}
		}

		return c.json({
			success: true,
			refreshResults: refreshData ? refreshResults : undefined,
		});
	} catch (error) {
		console.error('Error updating TMDb ID:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Get award organizations, ceremonies, and categories for nomination editing
adminRoutes.get('/awards', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);

		// Get award organizations
		const organizations = await database
			.select({
				uid: awardOrganizations.uid,
				name: awardOrganizations.name,
				country: awardOrganizations.country,
			})
			.from(awardOrganizations)
			.orderBy(awardOrganizations.name);

		// Get award ceremonies
		const ceremonies = await database
			.select({
				uid: awardCeremonies.uid,
				organizationUid: awardCeremonies.organizationUid,
				year: awardCeremonies.year,
				ceremonyNumber: awardCeremonies.ceremonyNumber,
				organizationName: awardOrganizations.name,
			})
			.from(awardCeremonies)
			.innerJoin(
				awardOrganizations,
				eq(awardCeremonies.organizationUid, awardOrganizations.uid),
			)
			.orderBy(awardOrganizations.name, awardCeremonies.year);

		// Get award categories
		const categories = await database
			.select({
				uid: awardCategories.uid,
				organizationUid: awardCategories.organizationUid,
				name: awardCategories.name,
				organizationName: awardOrganizations.name,
			})
			.from(awardCategories)
			.innerJoin(
				awardOrganizations,
				eq(awardCategories.organizationUid, awardOrganizations.uid),
			)
			.orderBy(awardOrganizations.name, awardCategories.name);

		return c.json({
			organizations,
			ceremonies,
			categories,
		});
	} catch (error) {
		console.error('Error fetching awards data:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Add nomination
adminRoutes.post('/movies/:movieId/nominations', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const movieId = c.req.param('movieId');
		const {
			ceremonyUid,
			categoryUid,
			isWinner = false,
			specialMention,
		} = await c.req.json();

		// Validate required fields
		if (!ceremonyUid || !categoryUid) {
			return c.json({error: 'Ceremony and category are required'}, 400);
		}

		// Check if movie exists
		const movieExists = await database
			.select({uid: movies.uid})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movieExists.length === 0) {
			return c.json({error: 'Movie not found'}, 404);
		}

		// Check if ceremony exists
		const ceremonyExists = await database
			.select({uid: awardCeremonies.uid})
			.from(awardCeremonies)
			.where(eq(awardCeremonies.uid, ceremonyUid))
			.limit(1);

		if (ceremonyExists.length === 0) {
			return c.json({error: 'Ceremony not found'}, 404);
		}

		// Check if category exists
		const categoryExists = await database
			.select({uid: awardCategories.uid})
			.from(awardCategories)
			.where(eq(awardCategories.uid, categoryUid))
			.limit(1);

		if (categoryExists.length === 0) {
			return c.json({error: 'Category not found'}, 404);
		}

		// Check if nomination already exists
		const existingNomination = await database
			.select({uid: nominations.uid})
			.from(nominations)
			.where(
				and(
					eq(nominations.movieUid, movieId),
					eq(nominations.ceremonyUid, ceremonyUid),
					eq(nominations.categoryUid, categoryUid),
				),
			)
			.limit(1);

		if (existingNomination.length > 0) {
			return c.json(
				{
					error:
						'Nomination already exists for this movie, ceremony, and category',
				},
				409,
			);
		}

		// Add nomination
		const newNomination = await database
			.insert(nominations)
			.values({
				movieUid: movieId,
				ceremonyUid,
				categoryUid,
				isWinner: isWinner ? 1 : 0,
				specialMention: specialMention || undefined,
			})
			.returning();

		return c.json(newNomination[0]);
	} catch (error) {
		console.error('Error adding nomination:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Update nomination
adminRoutes.put('/nominations/:nominationId', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const nominationId = c.req.param('nominationId');
		const {isWinner, specialMention} = await c.req.json();

		// Check if nomination exists
		const nomination = await database
			.select({uid: nominations.uid})
			.from(nominations)
			.where(eq(nominations.uid, nominationId))
			.limit(1);

		if (nomination.length === 0) {
			return c.json({error: 'Nomination not found'}, 404);
		}

		// Update nomination
		await database
			.update(nominations)
			.set({
				isWinner: isWinner ? 1 : 0,
				specialMention: specialMention || undefined,
				updatedAt: Math.floor(Date.now() / 1000),
			})
			.where(eq(nominations.uid, nominationId));

		return c.json({success: true});
	} catch (error) {
		console.error('Error updating nomination:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Delete nomination
adminRoutes.delete('/nominations/:nominationId', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const nominationId = c.req.param('nominationId');

		// Check if nomination exists
		const nomination = await database
			.select({uid: nominations.uid})
			.from(nominations)
			.where(eq(nominations.uid, nominationId))
			.limit(1);

		if (nomination.length === 0) {
			return c.json({error: 'Nomination not found'}, 404);
		}

		// Delete nomination
		await database.delete(nominations).where(eq(nominations.uid, nominationId));

		return c.json({success: true});
	} catch (error) {
		console.error('Error deleting nomination:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Auto-fetch TMDb data using IMDb ID
adminRoutes.post('/movies/:id/auto-fetch-tmdb', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const movieId = c.req.param('id');

		// Check if movie exists and has IMDb ID
		const movie = await database
			.select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movie.length === 0) {
			return c.json({error: 'Movie not found'}, 404);
		}

		const {imdbId, tmdbId} = movie[0];
		if (!imdbId) {
			return c.json({error: 'Movie does not have an IMDb ID'}, 400);
		}

		const tmdbApiKey = c.env.TMDB_API_KEY;
		if (!tmdbApiKey || tmdbApiKey === '') {
			return c.json({error: 'TMDb API key not configured'}, 500);
		}

		const fetchResults = {
			tmdbIdSet: false,
			postersAdded: 0,
			translationsAdded: 0,
		};

		try {
			// Import TMDb utilities
			const {findTMDBByImdbId, fetchTMDBMovieTranslations, savePosterUrls} =
				await import('../../../scrapers/src/common/tmdb-utilities');

			let movieTmdbId: number | undefined = tmdbId ?? undefined;

			// Find TMDb ID if not already set
			if (!movieTmdbId) {
				movieTmdbId = await findTMDBByImdbId(imdbId, tmdbApiKey);

				if (!movieTmdbId) {
					return c.json({error: 'TMDb映画が見つかりませんでした'}, 404);
				}

				// Check if TMDb ID is already used by another movie
				const existingMovie = await database
					.select({uid: movies.uid})
					.from(movies)
					.where(
						and(eq(movies.tmdbId, movieTmdbId), not(eq(movies.uid, movieId))),
					)
					.limit(1);

				if (existingMovie.length > 0) {
					return c.json(
						{error: 'このTMDb IDは既に他の映画で使用されています'},
						409,
					);
				}

				// Save TMDb ID to database
				try {
					await database
						.update(movies)
						.set({
							tmdbId: movieTmdbId,
							updatedAt: Math.floor(Date.now() / 1000),
						})
						.where(eq(movies.uid, movieId));
				} catch (dbError) {
					console.error('Database update error:', {
						error: dbError,
						movieId,
						tmdbId: movieTmdbId,
						updatedAt: Math.floor(Date.now() / 1000),
					});
					throw dbError;
				}

				fetchResults.tmdbIdSet = true;
			}

			type TMDBMovieImages = {
				id: number;
				posters: Array<{
					file_path: string;
					width: number;
					height: number;
					iso_639_1: string | undefined;
				}>;
			};

			// Fetch and save posters using TMDb ID
			const imagesUrl = new URL(
				`https://api.themoviedb.org/3/movie/${movieTmdbId}/images`,
			);
			imagesUrl.searchParams.append('api_key', tmdbApiKey);

			const imagesResponse = await fetch(imagesUrl.toString());
			if (imagesResponse.ok) {
				const images = (await imagesResponse.json()) as TMDBMovieImages;
				if (images.posters && images.posters.length > 0) {
					const savedPosters = await savePosterUrls(
						movieId,
						images.posters,
						c.env,
					);
					fetchResults.postersAdded = savedPosters;
				}
			}

			// Fetch and save translations using TMDb Translations API
			let translationsAdded = 0;
			const {translations} = await import('../../../src/schema/translations');

			// Get all translations from TMDb
			const translationsData = await fetchTMDBMovieTranslations(
				movieTmdbId,
				tmdbApiKey,
			);

			if (translationsData?.translations) {
				// Find English title (original language)
				const englishTranslation = translationsData.translations.find(
					(t: MovieDatabaseTranslation) =>
						t.iso_639_1 === 'en' && t.data?.title,
				);

				if (englishTranslation?.data?.title) {
					await database
						.insert(translations)
						.values({
							resourceType: 'movie_title',
							resourceUid: movieId,
							languageCode: 'en',
							content: englishTranslation.data.title,
							isDefault: 1,
						})
						.onConflictDoUpdate({
							target: [
								translations.resourceType,
								translations.resourceUid,
								translations.languageCode,
							],
							set: {
								content: englishTranslation.data.title,
								updatedAt: Math.floor(Date.now() / 1000),
							},
						});
					translationsAdded++;
				}

				// Find Japanese title
				const japaneseTranslation = translationsData.translations.find(
					(t: MovieDatabaseTranslation) =>
						t.iso_639_1 === 'ja' && t.data?.title,
				);

				if (japaneseTranslation?.data?.title) {
					await database
						.insert(translations)
						.values({
							resourceType: 'movie_title',
							resourceUid: movieId,
							languageCode: 'ja',
							content: japaneseTranslation.data.title,
							isDefault: 0,
						})
						.onConflictDoUpdate({
							target: [
								translations.resourceType,
								translations.resourceUid,
								translations.languageCode,
							],
							set: {
								content: japaneseTranslation.data.title,
								updatedAt: Math.floor(Date.now() / 1000),
							},
						});
					translationsAdded++;
				}
			}

			fetchResults.translationsAdded = translationsAdded;

			return c.json({
				success: true,
				fetchResults,
			});
		} catch (fetchError) {
			console.error('Error during TMDb auto-fetch:', fetchError);
			const errorMessage =
				fetchError instanceof Error ? fetchError.message : 'Unknown error';
			return c.json(
				{
					error: 'TMDbデータの自動取得に失敗しました',
					details: errorMessage,
				},
				500,
			);
		}
	} catch (error) {
		console.error('Error auto-fetching TMDb data:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Refresh TMDb data (posters and translations)
adminRoutes.post('/movies/:id/refresh-tmdb', authMiddleware, async (c) => {
	try {
		const database = getDatabase(c.env);
		const movieId = c.req.param('id');

		// Check if movie exists and has TMDb ID
		const movie = await database
			.select({uid: movies.uid, tmdbId: movies.tmdbId})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movie.length === 0) {
			return c.json({error: 'Movie not found'}, 404);
		}

		const {tmdbId} = movie[0];
		if (!tmdbId) {
			return c.json({error: 'Movie does not have a TMDb ID'}, 400);
		}

		if (!c.env.TMDB_API_KEY) {
			return c.json({error: 'TMDb API key not configured'}, 500);
		}

		const refreshResults = {
			postersAdded: 0,
			translationsAdded: 0,
		};

		try {
			// Import TMDb utilities
			const {fetchTMDBMovieTranslations, savePosterUrls} = await import(
				'../../../scrapers/src/common/tmdb-utilities'
			);

			type TMDBMovieImages = {
				id: number;
				posters: Array<{
					file_path: string;
					width: number;
					height: number;
					iso_639_1: string | undefined;
				}>;
			};

			// Fetch and save posters using TMDb ID
			const imagesUrl = new URL(
				`https://api.themoviedb.org/3/movie/${tmdbId}/images`,
			);
			imagesUrl.searchParams.append('api_key', c.env.TMDB_API_KEY);

			const imagesResponse = await fetch(imagesUrl.toString());
			if (imagesResponse.ok) {
				const images = (await imagesResponse.json()) as TMDBMovieImages;
				if (images.posters && images.posters.length > 0) {
					const savedPosters = await savePosterUrls(
						movieId,
						images.posters,
						c.env,
					);
					refreshResults.postersAdded = savedPosters;
				}
			}

			// Fetch and save translations using TMDb Translations API
			let translationsAdded = 0;
			const {translations} = await import('../../../src/schema/translations');

			// Get all translations from TMDb
			const translationsData = await fetchTMDBMovieTranslations(
				tmdbId,
				c.env.TMDB_API_KEY,
			);

			if (translationsData?.translations) {
				// Find English title (original language)
				const englishTranslation = translationsData.translations.find(
					(t: MovieDatabaseTranslation) =>
						t.iso_639_1 === 'en' && t.data?.title,
				);

				if (englishTranslation?.data?.title) {
					await database
						.insert(translations)
						.values({
							resourceType: 'movie_title',
							resourceUid: movieId,
							languageCode: 'en',
							content: englishTranslation.data.title,
							isDefault: 1,
						})
						.onConflictDoUpdate({
							target: [
								translations.resourceType,
								translations.resourceUid,
								translations.languageCode,
							],
							set: {
								content: englishTranslation.data.title,
								updatedAt: Math.floor(Date.now() / 1000),
							},
						});
					translationsAdded++;
				}

				// Find Japanese title
				const japaneseTranslation = translationsData.translations.find(
					(t: MovieDatabaseTranslation) =>
						t.iso_639_1 === 'ja' && t.data?.title,
				);

				if (japaneseTranslation?.data?.title) {
					await database
						.insert(translations)
						.values({
							resourceType: 'movie_title',
							resourceUid: movieId,
							languageCode: 'ja',
							content: japaneseTranslation.data.title,
							isDefault: 0,
						})
						.onConflictDoUpdate({
							target: [
								translations.resourceType,
								translations.resourceUid,
								translations.languageCode,
							],
							set: {
								content: japaneseTranslation.data.title,
								updatedAt: Math.floor(Date.now() / 1000),
							},
						});
					translationsAdded++;
				}
			}

			refreshResults.translationsAdded = translationsAdded;

			return c.json({
				success: true,
				refreshResults,
			});
		} catch (refreshError) {
			console.error('Error during TMDb data refresh:', refreshError);
			return c.json({error: 'Failed to refresh TMDb data'}, 500);
		}
	} catch (error) {
		console.error('Error refreshing TMDb data:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Merge movies - combines source movie data into target movie and deletes source
adminRoutes.post(
	'/movies/:sourceId/merge/:targetId',
	authMiddleware,
	async (c) => {
		try {
			const database = getDatabase(c.env);
			const sourceId = c.req.param('sourceId');
			const targetId = c.req.param('targetId');

			if (sourceId === targetId) {
				return c.json(
					{error: 'Source and target cannot be the same movie'},
					400,
				);
			}

			// Verify both movies exist
			const [sourceMovie] = await database
				.select()
				.from(movies)
				.where(eq(movies.uid, sourceId))
				.limit(1);

			const [targetMovie] = await database
				.select()
				.from(movies)
				.where(eq(movies.uid, targetId))
				.limit(1);

			if (!sourceMovie) {
				return c.json({error: 'Source movie not found'}, 404);
			}

			if (!targetMovie) {
				return c.json({error: 'Target movie not found'}, 404);
			}

			// Merge operations in transaction
			await database.transaction(async (tx) => {
				// Update article_links
				await tx
					.update(articleLinks)
					.set({movieUid: targetId})
					.where(eq(articleLinks.movieUid, sourceId));

				// Update movie_selections
				await tx
					.update(movieSelections)
					.set({movieId: targetId})
					.where(eq(movieSelections.movieId, sourceId));

				// Update nominations
				await tx
					.update(nominations)
					.set({movieUid: targetId})
					.where(eq(nominations.movieUid, sourceId));

				// Update reference_urls
				await tx
					.update(referenceUrls)
					.set({movieUid: targetId})
					.where(eq(referenceUrls.movieUid, sourceId));

				// Merge translations (avoid duplicates)
				const sourceTranslations = await tx
					.select()
					.from(translations)
					.where(
						and(
							eq(translations.resourceType, 'movie_title'),
							eq(translations.resourceUid, sourceId),
						),
					);

				for (const translation of sourceTranslations) {
					await tx
						.insert(translations)
						.values({
							resourceType: 'movie_title',
							resourceUid: targetId,
							languageCode: translation.languageCode,
							content: translation.content,
							isDefault: translation.isDefault,
						})
						.onConflictDoNothing({
							target: [
								translations.resourceType,
								translations.resourceUid,
								translations.languageCode,
							],
						});
				}

				// Delete source translations
				await tx
					.delete(translations)
					.where(
						and(
							eq(translations.resourceType, 'movie_title'),
							eq(translations.resourceUid, sourceId),
						),
					);

				// Merge poster URLs (avoid duplicates by URL)
				const sourcePosters = await tx
					.select()
					.from(posterUrls)
					.where(eq(posterUrls.movieUid, sourceId));

				// Get existing target posters to check for URL duplicates
				const existingTargetPosters = await tx
					.select({url: posterUrls.url})
					.from(posterUrls)
					.where(eq(posterUrls.movieUid, targetId));

				const existingUrls = new Set(
					existingTargetPosters.map((p: {url: string}) => p.url),
				);

				for (const poster of sourcePosters) {
					// Only insert if URL doesn't already exist for target movie
					if (!existingUrls.has(poster.url)) {
						await tx.insert(posterUrls).values({
							movieUid: targetId,
							url: poster.url,
							width: poster.width,
							height: poster.height,
							languageCode: poster.languageCode,
							countryCode: poster.countryCode,
							sourceType: poster.sourceType,
							isPrimary: poster.isPrimary,
						});
					}
				}

				// Delete source posters
				await tx.delete(posterUrls).where(eq(posterUrls.movieUid, sourceId));

				// Update target movie with merged metadata (preserve existing if target has data)

				const updateData: any = {
					updatedAt: Math.floor(Date.now() / 1000),
				};

				if (!targetMovie.imdbId && sourceMovie.imdbId) {
					// Check if IMDb ID is already used by another movie
					const existingImdbMovie = await tx
						.select({uid: movies.uid})
						.from(movies)
						.where(
							and(
								eq(movies.imdbId, sourceMovie.imdbId),
								not(eq(movies.uid, targetId)),
							),
						)
						.limit(1);

					if (existingImdbMovie.length === 0) {
						updateData.imdbId = sourceMovie.imdbId;
					}
				}

				if (!targetMovie.tmdbId && sourceMovie.tmdbId) {
					// Check if TMDb ID is already used by another movie
					const existingTmdbMovie = await tx
						.select({uid: movies.uid})
						.from(movies)
						.where(
							and(
								eq(movies.tmdbId, sourceMovie.tmdbId),
								not(eq(movies.uid, targetId)),
							),
						)
						.limit(1);

					if (existingTmdbMovie.length === 0) {
						updateData.tmdbId = sourceMovie.tmdbId;
					}
				}

				if (Object.keys(updateData).length > 1) {
					await tx
						.update(movies)
						.set(updateData)
						.where(eq(movies.uid, targetId));
				}

				// Finally, delete the source movie
				await tx.delete(movies).where(eq(movies.uid, sourceId));
			});

			return c.json({
				success: true,
				message: `Movie ${sourceId} successfully merged into ${targetId}`,
			});
		} catch (error) {
			console.error('Error merging movies:', error);
			return c.json(
				{
					error: 'Internal server error',
					details: error instanceof Error ? error.message : String(error),
				},
				500,
			);
		}
	},
);
