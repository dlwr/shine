import {Command} from 'commander';
import {getDatabase} from '../../src/index.js';
import {movies, translations} from '../../src/schema/index.js';
import {and, eq, isNull} from 'drizzle-orm';
import {
	searchTMDBMovie,
	fetchTMDBMovieDetails,
} from './common/tmdb-utilities.js';

const program = new Command();

program
	.name('assign-imdb-ids')
	.description("Assign IMDb IDs to movies that don't have them using TMDb API")
	.option('--dry-run', 'Perform a dry run without making changes')
	.option(
		'--limit <number>',
		'Limit the number of movies to process',
		Number.parseInt,
		10,
	)
	.option(
		'--year <year>',
		'Process only movies from a specific year',
		Number.parseInt,
	)
	.parse();

const options = program.opts();

async function assignImdbIds() {
	console.log('Finding movies without IMDb IDs...');

	try {
		const database = getDatabase({
			TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
			TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
			TMDB_API_KEY: process.env.TMDB_API_KEY,
		});

		// Build complete query with all conditions
		const whereClause = options.year
			? and(isNull(movies.imdbId), eq(movies.year, options.year))
			: isNull(movies.imdbId);

		const baseQuery = database
			.select({
				uid: movies.uid,
				year: movies.year,
				tmdbId: movies.tmdbId,
				createdAt: movies.createdAt,
			})
			.from(movies)
			.where(whereClause)
			.orderBy(movies.createdAt);

		const moviesWithoutImdbId = options.limit
			? await baseQuery.limit(options.limit)
			: await baseQuery;

		console.log(`Found ${moviesWithoutImdbId.length} movies without IMDb IDs`);

		if (moviesWithoutImdbId.length === 0) {
			console.log('All movies have IMDb IDs!');
			return;
		}

		const tmdbApiKey = process.env.TMDB_API_KEY;
		if (!tmdbApiKey) {
			console.error('TMDB_API_KEY is not set');
			return;
		}

		let successCount = 0;
		let skipCount = 0;
		let errorCount = 0;

		for (const movie of moviesWithoutImdbId) {
			// Get movie title
			const movieTranslations = await database
				.select()
				.from(translations)
				.where(
					and(
						eq(translations.resourceUid, movie.uid),
						eq(translations.resourceType, 'movie_title'),
					),
				)
				.limit(1);

			const movieTitle = movieTranslations[0]?.content;

			if (!movieTitle) {
				console.log(`⚠️  No title found for movie ${movie.uid}`);
				skipCount++;
				continue;
			}

			console.log(
				`\nProcessing: ${movieTitle} (${movie.year ?? 'Unknown year'})`,
			);

			try {
				let {tmdbId} = movie;
				let imdbId: string | undefined;

				// If we already have TMDb ID, get details directly
				if (tmdbId) {
					const tmdbDetails = await fetchTMDBMovieDetails(tmdbId, tmdbApiKey);
					imdbId = tmdbDetails?.imdb_id;
				} else if (movie.year) {
					// Search for movie on TMDb
					const searchTmdbId = await searchTMDBMovie(
						movieTitle,
						movie.year,
						tmdbApiKey,
					);

					if (searchTmdbId) {
						tmdbId = searchTmdbId;

						// Get full details to fetch IMDb ID
						const tmdbDetails = await fetchTMDBMovieDetails(tmdbId, tmdbApiKey);
						imdbId = tmdbDetails?.imdb_id;
					}
				}

				if (imdbId) {
					if (options.dryRun) {
						console.log(`[DRY RUN] Would assign IMDb ID: ${imdbId}`);
						if (!movie.tmdbId && tmdbId) {
							console.log(`[DRY RUN] Would also assign TMDb ID: ${tmdbId}`);
						}
					} else {
						// Update movie with IMDb ID (and TMDb ID if we found it)
						const updateData: Record<string, unknown> = {imdbId};
						if (!movie.tmdbId && tmdbId) {
							updateData.tmdbId = tmdbId;
						}

						await database
							.update(movies)
							.set(updateData)
							.where(eq(movies.uid, movie.uid));

						console.log(`✓ Assigned IMDb ID: ${imdbId}`);
						if (!movie.tmdbId && tmdbId) {
							console.log(`✓ Also assigned TMDb ID: ${tmdbId}`);
						}
					}

					successCount++;
				} else {
					console.log(`⚠️  No IMDb ID found on TMDb`);
					skipCount++;
				}
			} catch (error) {
				console.error(`✗ Error processing movie: ${error}`);
				errorCount++;
			}

			// Add a small delay to avoid rate limiting
			await new Promise((resolve) => {
				setTimeout(resolve, 300);
			});
		}

		console.log('\n📊 Summary:');
		console.log(`✓ Successfully assigned: ${successCount}`);
		console.log(`⚠️  Skipped: ${skipCount}`);
		console.log(`✗ Errors: ${errorCount}`);
		console.log(`📋 Total processed: ${moviesWithoutImdbId.length}`);

		if (options.dryRun) {
			console.log('\nThis was a dry run. No changes were made.');
		}
	} catch (error) {
		console.error('Error occurred');
		console.error('Error:', error);
		process.exit(1);
	}
}

// Run the script
await assignImdbIds();
