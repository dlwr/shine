import {and, eq, getDatabase, sql, type Environment} from 'db';
import {articleLinks} from 'db/schema/article-links';
import {awardCategories} from 'db/schema/award-categories';
import {awardCeremonies} from 'db/schema/award-ceremonies';
import {awardOrganizations} from 'db/schema/award-organizations';
import {movieSelections} from 'db/schema/movie-selections';
import {movies} from 'db/schema/movies';
import {nominations} from 'db/schema/nominations';
import {posterUrls} from 'db/schema/poster-urls';
import {translations} from 'db/schema/translations';
import {Hono} from 'hono';
import {authMiddleware} from '../auth';
import {SelectionsService} from '../services';
import {
	checkETag,
	createCachedResponse,
	createETag,
	getCacheTTL,
} from '../utils/cache';

export const selectionsRoutes = new Hono<{Bindings: Environment}>();

function simpleHash(input: string): number {
	let hash = 0;
	for (let index = 0; index < input.length; index++) {
		const char = input.codePointAt(index) || 0;
		hash = (hash << 5) - hash + char;
		hash &= hash; // Convert to 32-bit integer
	}

	return Math.abs(hash);
}

function getSelectionDate(
	date: Date,
	type: 'daily' | 'weekly' | 'monthly',
): string {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();

	switch (type) {
		case 'daily': {
			return `${year}-${month.toString().padStart(2, '0')}-${day
				.toString()
				.padStart(2, '0')}`;
		}

		case 'weekly': {
			const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
			const fridayDate = new Date(date);
			fridayDate.setDate(day - daysSinceFriday);
			return `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1)
				.toString()
				.padStart(2, '0')}-${fridayDate.getDate().toString().padStart(2, '0')}`;
		}

		case 'monthly': {
			return `${year}-${month.toString().padStart(2, '0')}-01`;
		}
	}
}

function getDateSeed(date: Date, type: 'daily' | 'weekly' | 'monthly'): number {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();

	switch (type) {
		case 'daily': {
			const dateString = `${year}-${month.toString().padStart(2, '0')}-${day
				.toString()
				.padStart(2, '0')}`;
			return simpleHash(`daily-${dateString}`);
		}

		case 'weekly': {
			const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
			const fridayDate = new Date(date);
			fridayDate.setDate(day - daysSinceFriday);
			const weekString = `${fridayDate.getFullYear()}-${(
				fridayDate.getMonth() + 1
			)
				.toString()
				.padStart(2, '0')}-${fridayDate.getDate().toString().padStart(2, '0')}`;
			return simpleHash(`weekly-${weekString}`);
		}

		case 'monthly': {
			const monthString = `${year}-${month.toString().padStart(2, '0')}`;
			return simpleHash(`monthly-${monthString}`);
		}
	}
}

async function getMovieNominations(
	database: ReturnType<typeof getDatabase>,
	movieId: string,
) {
	const nominationsData = await database
		.select({
			nominationUid: nominations.uid,
			isWinner: nominations.isWinner,
			specialMention: nominations.specialMention,
			categoryUid: awardCategories.uid,
			categoryName: awardCategories.name,
			categoryNameEn: awardCategories.nameEn,
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
			eq(nominations.categoryUid, awardCategories.uid),
		)
		.innerJoin(
			awardCeremonies,
			eq(nominations.ceremonyUid, awardCeremonies.uid),
		)
		.innerJoin(
			awardOrganizations,
			eq(awardCeremonies.organizationUid, awardOrganizations.uid),
		)
		.where(eq(nominations.movieUid, movieId))
		.orderBy(
			awardCeremonies.year,
			awardOrganizations.name,
			awardCategories.name,
		);

	return nominationsData.map((nom: (typeof nominationsData)[0]) => ({
		uid: nom.nominationUid,
		isWinner: nom.isWinner === 1,
		specialMention: nom.specialMention,
		category: {
			uid: nom.categoryUid,
			name: nom.categoryNameEn || nom.categoryName,
		},
		ceremony: {
			uid: nom.ceremonyUid,
			number: nom.ceremonyNumber,
			year: nom.ceremonyYear,
		},
		organization: {
			uid: nom.organizationUid,
			name: nom.organizationName,
			shortName: nom.organizationShortName,
		},
	}));
}

async function getMovieByDateSeedPreview(
	database: ReturnType<typeof getDatabase>,
	date: Date,
	type: 'daily' | 'weekly' | 'monthly',
	preferredLanguage = 'en',
) {
	const selectionDate = getSelectionDate(date, type);

	// Check if we already have a selection for this date and type
	const existingSelection = await database
		.select()
		.from(movieSelections)
		.where(
			and(
				eq(movieSelections.selectionType, type),
				eq(movieSelections.selectionDate, selectionDate),
			),
		)
		.limit(1);

	let movieId: string;

	if (existingSelection.length > 0) {
		// Use the existing selection
		movieId = existingSelection[0].movieId;
	} else {
		// Generate a preview selection WITHOUT saving to database
		const seed = getDateSeed(date, type);

		// Get a random movie using the seed
		const totalMovies = await database
			.select({count: sql<number>`COUNT(*)`})
			.from(movies);

		const {count} = totalMovies[0];
		if (count === 0) {
			return;
		}

		const offset = Math.abs(seed) % count;
		const randomMovieResult = await database
			.select({uid: movies.uid})
			.from(movies)
			.orderBy(movies.createdAt)
			.limit(1)
			.offset(offset);

		if (randomMovieResult.length === 0) {
			return;
		}

		movieId = randomMovieResult[0].uid;
		// NOTE: We do NOT save this to the database for preview
	}

	// Now fetch the full movie details with translations
	const results = await database
		.select()
		.from(movies)
		.leftJoin(
			translations,
			and(
				eq(movies.uid, translations.resourceUid),
				eq(translations.resourceType, 'movie_title'),
				eq(translations.languageCode, preferredLanguage),
			),
		)
		.where(eq(movies.uid, movieId))
		.limit(1);

	if (results.length === 0 || !results[0].translations?.content) {
		// Try with default language
		const fallbackResults = await database
			.select()
			.from(movies)
			.leftJoin(
				translations,
				and(
					eq(movies.uid, translations.resourceUid),
					eq(translations.resourceType, 'movie_title'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (fallbackResults.length > 0) {
			const {movies: movie, translations: translation} = fallbackResults[0];

			const imdbUrl = movie.imdbId
				? `https://www.imdb.com/title/${movie.imdbId}/`
				: undefined;

			// Get nominations for this movie
			const movieNominations = await getMovieNominations(database, movie.uid);

			// Get all posters for this movie
			const posters = await database
				.select({
					url: posterUrls.url,
					languageCode: posterUrls.languageCode,
					isPrimary: posterUrls.isPrimary,
				})
				.from(posterUrls)
				.where(eq(posterUrls.movieUid, movie.uid))
				.orderBy(
					sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`,
				);

			return {
				uid: movie.uid,
				year: movie.year,
				originalLanguage: movie.originalLanguage,
				title: translation?.content,
				posterUrls: posters,
				imdbUrl,
				nominations: movieNominations,
			};
		}
	}

	if (results.length === 0) {
		return;
	}

	const {movies: movie, translations: translation} = results[0];

	const imdbUrl = movie.imdbId
		? `https://www.imdb.com/title/${movie.imdbId}/`
		: undefined;

	// Get nominations for this movie
	const movieNominations = await getMovieNominations(database, movie.uid);

	// Get all posters for this movie
	const posters = await database
		.select({
			url: posterUrls.url,
			languageCode: posterUrls.languageCode,
			isPrimary: posterUrls.isPrimary,
		})
		.from(posterUrls)
		.where(eq(posterUrls.movieUid, movie.uid))
		.orderBy(sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`);

	// Get article links for this movie
	const topArticles = await database
		.select({
			uid: articleLinks.uid,
			url: articleLinks.url,
			title: articleLinks.title,
			description: articleLinks.description,
		})
		.from(articleLinks)
		.where(
			and(
				eq(articleLinks.movieUid, movie.uid),
				eq(articleLinks.isSpam, false),
				eq(articleLinks.isFlagged, false),
			),
		)
		.orderBy(sql`${articleLinks.submittedAt} DESC`)
		.limit(3);

	return {
		uid: movie.uid,
		year: movie.year,
		originalLanguage: movie.originalLanguage,
		title: translation?.content,
		posterUrls: posters,
		imdbUrl,
		nominations: movieNominations,
		articleLinks: topArticles,
	};
}

async function getMovieByDateSeed(
	database: ReturnType<typeof getDatabase>,
	date: Date,
	type: 'daily' | 'weekly' | 'monthly',
	preferredLanguage = 'en',
	forceNew = false,
) {
	const selectionDate = getSelectionDate(date, type);

	// First, check if we already have a selection for this date and type
	const existingSelection = await database
		.select()
		.from(movieSelections)
		.where(
			and(
				eq(movieSelections.selectionType, type),
				eq(movieSelections.selectionDate, selectionDate),
			),
		)
		.limit(1);

	let movieId: string;

	if (existingSelection.length > 0 && !forceNew) {
		// Use the existing selection
		movieId = existingSelection[0].movieId;
	} else {
		// Generate a new selection
		let seed = getDateSeed(date, type);

		// If forcing new selection, add extra randomness
		if (forceNew) {
			seed += Date.now();
		}

		// Get a random movie using the seed
		const totalMovies = await database
			.select({count: sql<number>`COUNT(*)`})
			.from(movies);

		const {count} = totalMovies[0];
		if (count === 0) {
			return;
		}

		const offset = Math.abs(seed) % count;
		const randomMovieResult = await database
			.select({uid: movies.uid})
			.from(movies)
			.orderBy(movies.createdAt)
			.limit(1)
			.offset(offset);

		if (randomMovieResult.length === 0) {
			return;
		}

		movieId = randomMovieResult[0].uid;

		// Save the new selection to the database (replace existing if needed)
		try {
			if (existingSelection.length > 0) {
				// Delete existing selection first
				await database
					.delete(movieSelections)
					.where(
						and(
							eq(movieSelections.selectionType, type),
							eq(movieSelections.selectionDate, selectionDate),
						),
					);
			}

			await database.insert(movieSelections).values({
				selectionType: type,
				selectionDate,
				movieId,
			});
		} catch (error) {
			// If there's a race condition and another instance already inserted this selection,
			// just continue with the movieId we selected
			console.error('Error saving movie selection:', error);
		}
	}

	// Now fetch the full movie details with translations
	const results = await database
		.select()
		.from(movies)
		.leftJoin(
			translations,
			and(
				eq(movies.uid, translations.resourceUid),
				eq(translations.resourceType, 'movie_title'),
				eq(translations.languageCode, preferredLanguage),
			),
		)
		.where(eq(movies.uid, movieId))
		.limit(1);

	if (results.length === 0 || !results[0].translations?.content) {
		// Try with default language
		const fallbackResults = await database
			.select()
			.from(movies)
			.leftJoin(
				translations,
				and(
					eq(movies.uid, translations.resourceUid),
					eq(translations.resourceType, 'movie_title'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (fallbackResults.length > 0) {
			const {movies: movie, translations: translation} = fallbackResults[0];

			const imdbUrl = movie.imdbId
				? `https://www.imdb.com/title/${movie.imdbId}/`
				: undefined;

			// Get nominations for this movie
			const movieNominations = await getMovieNominations(database, movie.uid);

			// Get all posters for this movie
			const posters = await database
				.select({
					url: posterUrls.url,
					languageCode: posterUrls.languageCode,
					isPrimary: posterUrls.isPrimary,
				})
				.from(posterUrls)
				.where(eq(posterUrls.movieUid, movie.uid))
				.orderBy(
					sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`,
				);

			return {
				uid: movie.uid,
				year: movie.year,
				originalLanguage: movie.originalLanguage,
				title: translation?.content,
				posterUrls: posters,
				imdbUrl,
				nominations: movieNominations,
			};
		}
	}

	if (results.length === 0) {
		return;
	}

	const {movies: movie, translations: translation} = results[0];

	const imdbUrl = movie.imdbId
		? `https://www.imdb.com/title/${movie.imdbId}/`
		: undefined;

	// Get nominations for this movie
	const movieNominations = await getMovieNominations(database, movie.uid);

	// Get all posters for this movie
	const posters = await database
		.select({
			url: posterUrls.url,
			languageCode: posterUrls.languageCode,
			isPrimary: posterUrls.isPrimary,
		})
		.from(posterUrls)
		.where(eq(posterUrls.movieUid, movie.uid))
		.orderBy(sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`);

	// Get article links for this movie
	const topArticles = await database
		.select({
			uid: articleLinks.uid,
			url: articleLinks.url,
			title: articleLinks.title,
			description: articleLinks.description,
		})
		.from(articleLinks)
		.where(
			and(
				eq(articleLinks.movieUid, movie.uid),
				eq(articleLinks.isSpam, false),
				eq(articleLinks.isFlagged, false),
			),
		)
		.orderBy(sql`${articleLinks.submittedAt} DESC`)
		.limit(3);

	return {
		uid: movie.uid,
		year: movie.year,
		originalLanguage: movie.originalLanguage,
		title: translation?.content,
		posterUrls: posters,
		imdbUrl,
		nominations: movieNominations,
		articleLinks: topArticles,
	};
}

function parseAcceptLanguage(acceptLanguage?: string): string[] {
	if (!acceptLanguage) return [];

	return acceptLanguage
		.split(',')
		.map((lang) => {
			const [code, q] = lang.trim().split(';q=');
			return {
				code: code.split('-')[0],
				quality: q ? Number.parseFloat(q) : 1,
			};
		})
		.sort((a, b) => b.quality - a.quality)
		.map((lang) => lang.code);
}

// Main endpoint for date-seeded movie selections
selectionsRoutes.get('/', async (c) => {
	try {
		const selectionsService = new SelectionsService(c.env);
		const localeParameter = c.req.query('locale');
		const acceptLanguage = c.req.header('accept-language');
		const preferredLanguages = localeParameter
			? [localeParameter]
			: parseAcceptLanguage(acceptLanguage);
		const locale =
			preferredLanguages.find((lang) => ['en', 'ja'].includes(lang)) || 'en';

		const result = await selectionsService.getDateSeededSelections({
			locale,
			date: new Date(),
		});

		// Create ETag for the response
		const etag = createETag(result);

		// Check if client has the same version
		if (checkETag(c.req, etag)) {
			return c.newResponse('', 304, {
				ETag: etag,
				'Cache-Control': 'public, max-age=3600',
			});
		}

		// Determine TTL based on the shortest period (daily)
		const ttl = getCacheTTL.selections.daily;

		// Create cached response with appropriate headers
		const response = createCachedResponse(result, ttl, {
			ETag: etag,
			'X-Cache-Status': 'MISS',
		});

		return response;
	} catch (error) {
		console.error('Error fetching feature movies:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Admin: Reselect movie for a specific period
selectionsRoutes.post('/reselect', authMiddleware, async (c) => {
	try {
		const selectionsService = new SelectionsService(c.env);
		const body = await c.req.json();
		const {type, locale = 'en'} = body;

		if (!type || !['daily', 'weekly', 'monthly'].includes(type)) {
			return c.json({error: 'Invalid selection type'}, 400);
		}

		const movie = await selectionsService.reselectMovie(type, locale);

		return c.json({
			type,
			movie,
		});
	} catch (error) {
		console.error('Error reselecting movie:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Admin: Preview next period movie selections
selectionsRoutes.get('/admin/preview-selections', authMiddleware, async (c) => {
	try {
		const selectionsService = new SelectionsService(c.env);
		const localeParameter = c.req.query('locale');
		const locale = localeParameter || 'en';

		const previews = await selectionsService.getNextPeriodPreviews(locale);

		return c.json(previews);
	} catch (error) {
		console.error('Error previewing next selections:', error);
		return c.json({error: 'Internal server error'}, 500);
	}
});

// Admin: Clean up future movie selections
selectionsRoutes.delete(
	'/admin/cleanup-future-selections',
	authMiddleware,
	async (c) => {
		try {
			const database = getDatabase(c.env);
			const now = new Date();

			const currentDates = {
				daily: getSelectionDate(now, 'daily'),
				weekly: getSelectionDate(now, 'weekly'),
				monthly: getSelectionDate(now, 'monthly'),
			};

			// Delete selections that are in the future
			const deletedDaily = await database
				.delete(movieSelections)
				.where(
					and(
						eq(movieSelections.selectionType, 'daily'),
						sql`${movieSelections.selectionDate} > ${currentDates.daily}`,
					),
				);

			const deletedWeekly = await database
				.delete(movieSelections)
				.where(
					and(
						eq(movieSelections.selectionType, 'weekly'),
						sql`${movieSelections.selectionDate} > ${currentDates.weekly}`,
					),
				);

			const deletedMonthly = await database
				.delete(movieSelections)
				.where(
					and(
						eq(movieSelections.selectionType, 'monthly'),
						sql`${movieSelections.selectionDate} > ${currentDates.monthly}`,
					),
				);

			return c.json({
				success: true,
				currentDates,
				deletedCount: {
					daily: deletedDaily.rowsAffected || 0,
					weekly: deletedWeekly.rowsAffected || 0,
					monthly: deletedMonthly.rowsAffected || 0,
				},
			});
		} catch (error) {
			console.error('Error cleaning up future selections:', error);
			return c.json({error: 'Internal server error'}, 500);
		}
	},
);

// Admin: Generate random movie preview for a specific date/type (no DB write)
selectionsRoutes.post(
	'/admin/random-movie-preview',
	authMiddleware,
	async (c) => {
		try {
			const database = getDatabase(c.env);
			const {type, date, locale = 'en'} = await c.req.json();

			// Validate inputs
			if (!type || !['daily', 'weekly', 'monthly'].includes(type)) {
				return c.json({error: 'Invalid selection type'}, 400);
			}

			if (!date) {
				return c.json({error: 'Date is required'}, 400);
			}

			// Validate date format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(date)) {
				return c.json({error: 'Date must be in YYYY-MM-DD format'}, 400);
			}

			// Parse the date and generate a preview (no DB write)
			const targetDate = new Date(date + 'T00:00:00.000Z');

			// Generate a random seed based on date + current timestamp for randomness
			const baseSeed = getDateSeed(targetDate, type);
			const randomSeed = baseSeed + Date.now();

			// Get a random movie using the random seed
			const totalMovies = await database
				.select({count: sql<number>`COUNT(*)`})
				.from(movies);

			const {count} = totalMovies[0];
			if (count === 0) {
				return c.json({error: 'No movies found'}, 404);
			}

			const offset = Math.abs(randomSeed) % count;
			const randomMovieResult = await database
				.select({uid: movies.uid})
				.from(movies)
				.orderBy(movies.createdAt)
				.limit(1)
				.offset(offset);

			if (randomMovieResult.length === 0) {
				return c.json({error: 'No movies found'}, 404);
			}

			const movieId = randomMovieResult[0].uid;

			// Fetch the full movie details (reuse existing logic)
			const results = await database
				.select()
				.from(movies)
				.leftJoin(
					translations,
					and(
						eq(movies.uid, translations.resourceUid),
						eq(translations.resourceType, 'movie_title'),
						eq(translations.languageCode, locale),
					),
				)
				.leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
				.where(eq(movies.uid, movieId))
				.limit(1);

			if (results.length === 0 || !results[0].translations?.content) {
				// Try with default language
				const fallbackResults = await database
					.select()
					.from(movies)
					.leftJoin(
						translations,
						and(
							eq(movies.uid, translations.resourceUid),
							eq(translations.resourceType, 'movie_title'),
							eq(translations.isDefault, 1),
						),
					)
					.leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
					.where(eq(movies.uid, movieId))
					.limit(1);

				if (fallbackResults.length > 0) {
					const {
						movies: movie,
						translations: translation,
						poster_urls: poster,
					} = fallbackResults[0];

					const imdbUrl = movie.imdbId
						? `https://www.imdb.com/title/${movie.imdbId}/`
						: undefined;

					// Get nominations for this movie
					const movieNominations = await getMovieNominations(
						database,
						movie.uid,
					);

					return c.json({
						uid: movie.uid,
						year: movie.year,
						originalLanguage: movie.originalLanguage,
						title: translation?.content,
						posterUrl: poster?.url,
						imdbUrl,
						nominations: movieNominations,
					});
				}
			}

			if (results.length === 0) {
				return c.json({error: 'Movie not found'}, 404);
			}

			const {
				movies: movie,
				translations: translation,
				poster_urls: poster,
			} = results[0];

			const imdbUrl = movie.imdbId
				? `https://www.imdb.com/title/${movie.imdbId}/`
				: undefined;

			// Get nominations for this movie
			const movieNominations = await getMovieNominations(database, movie.uid);

			// Get article links for this movie
			const topArticles = await database
				.select({
					uid: articleLinks.uid,
					url: articleLinks.url,
					title: articleLinks.title,
					description: articleLinks.description,
				})
				.from(articleLinks)
				.where(
					and(
						eq(articleLinks.movieUid, movie.uid),
						eq(articleLinks.isSpam, false),
						eq(articleLinks.isFlagged, false),
					),
				)
				.orderBy(sql`${articleLinks.submittedAt} DESC`)
				.limit(3);

			return c.json({
				uid: movie.uid,
				year: movie.year,
				originalLanguage: movie.originalLanguage,
				title: translation?.content,
				posterUrl: poster?.url,
				imdbUrl,
				nominations: movieNominations,
				articleLinks: topArticles,
			});
		} catch (error) {
			console.error('Error generating random movie preview:', error);
			return c.json({error: 'Internal server error'}, 500);
		}
	},
);

// Admin: Override movie selection for specific date/type
selectionsRoutes.post(
	'/admin/override-selection',
	authMiddleware,
	async (c) => {
		try {
			const selectionsService = new SelectionsService(c.env);
			const {type, date, movieId} = await c.req.json();

			// Validate inputs
			if (!type || !['daily', 'weekly', 'monthly'].includes(type)) {
				return c.json({error: 'Invalid selection type'}, 400);
			}

			if (!date) {
				return c.json({error: 'Date is required'}, 400);
			}

			if (!movieId) {
				return c.json({error: 'Movie ID is required'}, 400);
			}

			// Validate date format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(date)) {
				return c.json({error: 'Date must be in YYYY-MM-DD format'}, 400);
			}

			const targetDate = new Date(date + 'T00:00:00.000Z');
			await selectionsService.overrideSelection(type, movieId, targetDate);

			return c.json({
				success: true,
			});
		} catch (error) {
			console.error('Error overriding selection:', error);

			if (error instanceof Error && error.message === 'Movie not found') {
				return c.json({error: 'Movie not found'}, 404);
			}

			return c.json({error: 'Internal server error'}, 500);
		}
	},
);
