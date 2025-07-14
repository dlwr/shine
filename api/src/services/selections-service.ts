import {and, eq, sql} from 'db';
import {articleLinks} from 'db/schema/article-links';
import {awardCategories} from 'db/schema/award-categories';
import {awardCeremonies} from 'db/schema/award-ceremonies';
import {awardOrganizations} from 'db/schema/award-organizations';
import {movieSelections} from 'db/schema/movie-selections';
import {movies} from 'db/schema/movies';
import {nominations} from 'db/schema/nominations';
import {posterUrls} from 'db/schema/poster-urls';
import {translations} from 'db/schema/translations';
import {EdgeCache} from '../utils/cache';
import {BaseService} from './base-service';
import type {DateSeedOptions, MovieSelection} from './types';

export class SelectionsService extends BaseService {
	private readonly cache = new EdgeCache();

	async getDateSeededSelections(options: DateSeedOptions): Promise<{
		daily: MovieSelection;
		weekly: MovieSelection;
		monthly: MovieSelection;
	}> {
		const {locale, date = new Date()} = options;

		const dailyMovie = await this.getMovieByDateSeed(date, 'daily', locale);
		const weeklyMovie = await this.getMovieByDateSeed(date, 'weekly', locale);
		const monthlyMovie = await this.getMovieByDateSeed(date, 'monthly', locale);

		return {
			daily: dailyMovie,
			weekly: weeklyMovie,
			monthly: monthlyMovie,
		};
	}

	async reselectMovie(
		type: 'daily' | 'weekly' | 'monthly',
		locale: string,
		date = new Date(),
	): Promise<MovieSelection> {
		const selectionDate = this.getSelectionDate(date, type);

		// Delete existing selection
		await this.database
			.delete(movieSelections)
			.where(
				and(
					eq(movieSelections.selectionType, type),
					eq(movieSelections.selectionDate, selectionDate),
				),
			);

		// Clear cache
		await this.cache.delete(`selection-${type}-${selectionDate}`);

		// Generate new selection with randomness
		const selectedMovie = await this.generateRandomMovieSelection(
			date,
			type,
			locale,
			true,
		);
		if (!selectedMovie) {
			throw new Error('No movies available for selection');
		}

		// Get complete movie data and cache it
		const movie = await this.getCompleteMovieData(selectedMovie.uid, locale);

		// Cache result
		const cacheKey = `selection-${type}-${selectionDate}`;
		const response = new Response(JSON.stringify(movie), {
			headers: {'Content-Type': 'application/json'},
		});
		await this.cache.put(cacheKey, response);

		return movie;
	}

	async previewSelections(
		type: 'daily' | 'weekly' | 'monthly',
		locale: string,
		futureDate: Date,
	): Promise<MovieSelection[]> {
		const previews: MovieSelection[] = [];
		const baseDate = new Date(futureDate);

		for (let index = 0; index < 7; index++) {
			const previewDate = new Date(baseDate);

			if (type === 'daily') {
				previewDate.setDate(baseDate.getDate() + index);
			} else if (type === 'weekly') {
				previewDate.setDate(baseDate.getDate() + index * 7);
			} else {
				previewDate.setMonth(baseDate.getMonth() + index);
			}

			const movie = await this.generateMovieSelection(
				previewDate,
				type,
				locale,
				false,
			);
			if (movie) {
				previews.push(movie);
			}
		}

		return previews;
	}

	async getNextPeriodPreviews(locale: string): Promise<{
		nextDaily: {date: string; movie?: MovieSelection};
		nextWeekly: {date: string; movie?: MovieSelection};
		nextMonthly: {date: string; movie?: MovieSelection};
	}> {
		const now = new Date();
		console.log(
			'🔍 Getting next period previews for locale:',
			locale,
			'at',
			now.toISOString(),
		);

		// Calculate next dates
		const nextDay = new Date(now);
		nextDay.setDate(now.getDate() + 1);

		const daysSinceFriday = (now.getDay() - 5 + 7) % 7;
		const fridayDate = new Date(now);
		fridayDate.setDate(now.getDate() - daysSinceFriday);
		const nextFriday = new Date(fridayDate);
		nextFriday.setDate(fridayDate.getDate() + 7);

		const nextMonth = new Date(now);
		nextMonth.setMonth(now.getMonth() + 1);
		nextMonth.setDate(1);

		const nextDates = {
			daily: this.getSelectionDate(nextDay, 'daily'),
			weekly: this.getSelectionDate(nextFriday, 'weekly'),
			monthly: this.getSelectionDate(nextMonth, 'monthly'),
		};

		console.log('📅 Next dates calculated:', nextDates);

		// Check cache first for preview results
		const cacheKey = `preview-selections-${locale}-${nextDates.daily}-${nextDates.weekly}-${nextDates.monthly}`;
		const cachedResult = await this.cache.get(cacheKey);

		if (cachedResult?.data) {
			console.log('💾 Using cached preview results');
			return cachedResult.data as {
				nextDaily: {date: string; movie?: MovieSelection | undefined};
				nextWeekly: {date: string; movie?: MovieSelection | undefined};
				nextMonthly: {date: string; movie?: MovieSelection | undefined};
			};
		}

		// Get next period selections - use existing if available, otherwise generate preview
		const [nextDailyMovie, nextWeeklyMovie, nextMonthlyMovie] =
			await Promise.all([
				this.getMovieByDateSeed(nextDay, 'daily', locale),
				this.getMovieByDateSeed(nextFriday, 'weekly', locale),
				this.getMovieByDateSeed(nextMonth, 'monthly', locale),
			]);

		console.log('🎬 Generated movie selections:', {
			daily: nextDailyMovie?.title || 'No movie',
			weekly: nextWeeklyMovie?.title || 'No movie',
			monthly: nextMonthlyMovie?.title || 'No movie',
		});

		const result = {
			nextDaily: {
				date: nextDates.daily,
				movie: nextDailyMovie,
			},
			nextWeekly: {
				date: nextDates.weekly,
				movie: nextWeeklyMovie,
			},
			nextMonthly: {
				date: nextDates.monthly,
				movie: nextMonthlyMovie,
			},
		};

		// Cache the preview results for 10 minutes
		await this.cache.set(cacheKey, result, 600); // 10 minutes TTL

		console.log(
			'✅ Final preview result (cached):',
			JSON.stringify(result, undefined, 2),
		);
		return result;
	}

	async overrideSelection(
		type: 'daily' | 'weekly' | 'monthly',
		movieId: string,
		date = new Date(),
	): Promise<void> {
		const selectionDate = this.getSelectionDate(date, type);

		// Check if movie exists
		const movieExists = await this.database
			.select({uid: movies.uid})
			.from(movies)
			.where(eq(movies.uid, movieId))
			.limit(1);

		if (movieExists.length === 0) {
			throw new Error('Movie not found');
		}

		// Delete existing selection
		await this.database
			.delete(movieSelections)
			.where(
				and(
					eq(movieSelections.selectionType, type),
					eq(movieSelections.selectionDate, selectionDate),
				),
			);

		// Insert override selection
		await this.database.insert(movieSelections).values({
			movieId,
			selectionType: type,
			selectionDate,
			createdAt: Math.floor(Date.now() / 1000),
			updatedAt: Math.floor(Date.now() / 1000),
		});

		// Clear cache
		await this.cache.delete(`selection-${type}-${selectionDate}`);
	}

	private async getMovieByDateSeed(
		date: Date,
		type: 'daily' | 'weekly' | 'monthly',
		locale: string,
	): Promise<MovieSelection> {
		const selectionDate = this.getSelectionDate(date, type);
		const cacheKey = `selection-${type}-${selectionDate}`;

		// Try to get cached result
		const cached = await this.cache.get(cacheKey);
		if (cached?.data) {
			return cached.data as MovieSelection;
		}

		// Check for existing selection in database
		const existingSelection = await this.database
			.select({movieId: movieSelections.movieId})
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
			movieId = existingSelection[0].movieId;
		} else {
			// Generate new selection
			const selectedMovie = await this.generateMovieSelection(
				date,
				type,
				locale,
				true,
			);
			if (!selectedMovie) {
				throw new Error('No movies available for selection');
			}

			movieId = selectedMovie.uid;
		}

		// Get complete movie data
		const movie = await this.getCompleteMovieData(movieId, locale);

		// Cache result
		const response = new Response(JSON.stringify(movie), {
			headers: {'Content-Type': 'application/json'},
		});
		await this.cache.put(cacheKey, response);

		return movie;
	}

	private async generateMovieSelection(
		date: Date,
		type: 'daily' | 'weekly' | 'monthly',
		locale: string,
		persistSelection: boolean,
	): Promise<MovieSelection | undefined> {
		const seed = this.getDateSeed(date, type);

		// Get all movies with basic data for selection
		const availableMovies = await this.database
			.select({
				uid: movies.uid,
				year: movies.year,
				originalLanguage: movies.originalLanguage,
				imdbId: movies.imdbId,
				tmdbId: movies.tmdbId,
			})
			.from(movies)
			.orderBy(movies.year, movies.uid);

		if (availableMovies.length === 0) {
			return undefined;
		}

		// Use seed to select movie deterministically
		const selectedIndex = seed % availableMovies.length;
		const selectedMovieData = availableMovies[selectedIndex];

		// Persist selection if requested
		if (persistSelection) {
			const selectionDate = this.getSelectionDate(date, type);

			try {
				await this.database.insert(movieSelections).values({
					movieId: selectedMovieData.uid,
					selectionType: type,
					selectionDate,
					createdAt: Math.floor(Date.now() / 1000),
					updatedAt: Math.floor(Date.now() / 1000),
				});
			} catch {
				// Selection might already exist due to race condition, ignore
			}
		}

		// Get complete movie data
		return this.getCompleteMovieData(selectedMovieData.uid, locale);
	}

	private async getCompleteMovieData(
		movieId: string,
		locale: string,
	): Promise<MovieSelection> {
		// Get movie basic data
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

		// Get all translations for the movie
		const allTranslations = await this.database
			.select({
				languageCode: translations.languageCode,
				content: translations.content,
				isDefault: translations.isDefault,
				resourceType: translations.resourceType,
			})
			.from(translations)
			.where(
				and(
					eq(translations.resourceUid, movieId),
					eq(translations.resourceType, 'movie_title'),
				),
			);

		// Select best title based on locale with fallback
		const languageCode = locale.split('-')[0];
		let selectedTitle: string | undefined;

		// Priority 1: Translation with matching language
		const localeMatch = allTranslations.find(
			(t) => t.languageCode === languageCode,
		);
		if (localeMatch) {
			selectedTitle = localeMatch.content;
		} else {
			// Priority 2: Default translation
			const defaultTranslation = allTranslations.find((t) => t.isDefault === 1);
			if (defaultTranslation) {
				selectedTitle = defaultTranslation.content;
			} else {
				// Priority 3: Japanese translation
				const jaTranslation = allTranslations.find(
					(t) => t.languageCode === 'ja',
				);
				if (jaTranslation) {
					selectedTitle = jaTranslation.content;
				} else {
					// Priority 4: English translation
					const enTranslation = allTranslations.find(
						(t) => t.languageCode === 'en',
					);
					if (enTranslation) {
						selectedTitle = enTranslation.content;
					} else if (allTranslations.length > 0) {
						// Priority 5: First available translation
						selectedTitle = allTranslations[0].content;
					}
				}
			}
		}

		// Get description for the locale
		const descriptionResult = await this.database
			.select({
				content: translations.content,
			})
			.from(translations)
			.where(
				and(
					eq(translations.resourceUid, movieId),
					eq(translations.resourceType, 'movie_description'),
					eq(translations.languageCode, locale),
				),
			)
			.limit(1);

		const description = descriptionResult[0]?.content || undefined;

		// Get nominations
		const nominationsData = await this.database
			.select({
				nominationUid: nominations.uid,
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

		// Get all posters for this movie
		const posters = await this.database
			.select({
				url: posterUrls.url,
				languageCode: posterUrls.languageCode,
				isPrimary: posterUrls.isPrimary,
			})
			.from(posterUrls)
			.where(eq(posterUrls.movieUid, movieId))
			.orderBy(sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`);

		// Get article links
		const topArticles = await this.database
			.select({
				uid: articleLinks.uid,
				url: articleLinks.url,
				title: articleLinks.title,
				description: articleLinks.description || undefined,
			})
			.from(articleLinks)
			.where(
				and(
					eq(articleLinks.movieUid, movieId),
					eq(articleLinks.isSpam, false),
					eq(articleLinks.isFlagged, false),
				),
			)
			.orderBy(sql`${articleLinks.submittedAt} DESC`)
			.limit(3);

		// Generate IMDb URL if IMDb ID exists
		const imdbUrl = movie.imdbId
			? `https://www.imdb.com/title/${movie.imdbId}/`
			: undefined;

		return {
			uid: movie.uid,
			year: movie.year ?? 0,
			originalLanguage: movie.originalLanguage,
			imdbId: movie.imdbId ?? undefined,
			tmdbId: movie.tmdbId ?? undefined,
			title: selectedTitle || `Unknown Title (${movie.year})`,
			description: description || undefined,
			posterUrls: posters.map((p) => ({
				url: p.url,
				languageCode: p.languageCode ?? undefined,
				isPrimary: p.isPrimary ?? 0,
			})),
			imdbUrl,
			nominations: nominationsData.map((nom) => ({
				uid: nom.nominationUid,
				isWinner: Boolean(nom.isWinner),
				specialMention: nom.specialMention ?? undefined,
				category: {
					uid: nom.categoryUid,
					name: nom.categoryName,
				},
				ceremony: {
					uid: nom.ceremonyUid,
					number: nom.ceremonyNumber ?? undefined,
					year: nom.ceremonyYear,
				},
				organization: {
					uid: nom.organizationUid,
					name: nom.organizationName,
					shortName: nom.organizationShortName ?? undefined,
				},
			})),
			articleLinks: topArticles.map((article) => ({
				uid: article.uid,
				url: article.url,
				title: article.title,
				description: article.description || undefined,
			})),
		};
	}

	private simpleHash(input: string): number {
		let hash = 0;
		for (let index = 0; index < input.length; index++) {
			const char = input.codePointAt(index) || 0;
			hash = (hash << 5) - hash + char;
			hash &= hash; // Convert to 32-bit integer
		}

		return Math.abs(hash);
	}

	private getSelectionDate(
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
					.padStart(2, '0')}-${fridayDate
					.getDate()
					.toString()
					.padStart(2, '0')}`;
			}

			case 'monthly': {
				return `${year}-${month.toString().padStart(2, '0')}-01`;
			}
		}
	}

	private getDateSeed(
		date: Date,
		type: 'daily' | 'weekly' | 'monthly',
	): number {
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();

		switch (type) {
			case 'daily': {
				const dateString = `${year}-${month.toString().padStart(2, '0')}-${day
					.toString()
					.padStart(2, '0')}`;
				return this.simpleHash(`daily-${dateString}`);
			}

			case 'weekly': {
				const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
				const fridayDate = new Date(date);
				fridayDate.setDate(day - daysSinceFriday);
				const weekString = `${fridayDate.getFullYear()}-${(
					fridayDate.getMonth() + 1
				)
					.toString()
					.padStart(2, '0')}-${fridayDate
					.getDate()
					.toString()
					.padStart(2, '0')}`;
				return this.simpleHash(`weekly-${weekString}`);
			}

			case 'monthly': {
				const monthString = `${year}-${month.toString().padStart(2, '0')}`;
				return this.simpleHash(`monthly-${monthString}`);
			}
		}
	}

	private async generateRandomMovieSelection(
		date: Date,
		type: 'daily' | 'weekly' | 'monthly',
		_locale: string,
		persistSelection: boolean,
	): Promise<{uid: string} | undefined> {
		// Get all movies with basic data for selection
		const availableMovies = await this.database
			.select({
				uid: movies.uid,
			})
			.from(movies)
			.orderBy(movies.createdAt);

		if (availableMovies.length === 0) {
			return undefined;
		}

		// Use random selection instead of seed-based
		const randomIndex = Math.floor(Math.random() * availableMovies.length);
		const selectedMovieData = availableMovies[randomIndex];

		// Persist selection if requested
		if (persistSelection) {
			const selectionDate = this.getSelectionDate(date, type);

			try {
				await this.database.insert(movieSelections).values({
					movieId: selectedMovieData.uid,
					selectionType: type,
					selectionDate,
					createdAt: Math.floor(Date.now() / 1000),
					updatedAt: Math.floor(Date.now() / 1000),
				});
			} catch {
				// Selection might already exist due to race condition, ignore
			}
		}

		return selectedMovieData;
	}
}
