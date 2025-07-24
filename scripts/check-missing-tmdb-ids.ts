import {config} from 'dotenv';
import {and, isNotNull, isNull, count} from 'drizzle-orm';
import {getDatabase} from '../src/index';
import {movies} from '../src/schema/movies';

// Load environment variables
config({path: '.dev.vars'});

async function checkMissingTmdbIds() {
	const db = getDatabase({
		TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
		TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
		TMDB_API_KEY: process.env.TMDB_API_KEY!,
		TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN!,
		OMDB_API_KEY: process.env.OMDB_API_KEY!,
	});

	const moviesWithImdbButNoTmdb = await db
		.select({
			uid: movies.uid,
			imdbId: movies.imdbId,
			tmdbId: movies.tmdbId,
			year: movies.year,
		})
		.from(movies)
		.where(and(isNotNull(movies.imdbId), isNull(movies.tmdbId)));

	console.log(
		`Found ${moviesWithImdbButNoTmdb.length} movies with IMDb ID but no TMDb ID`,
	);

	for (const movie of moviesWithImdbButNoTmdb) {
		console.log(`- ${movie.uid}: IMDb ${movie.imdbId}, Year ${movie.year}`);
	}

	const duplicateTmdbIds = await db
		.select({
			tmdbId: movies.tmdbId,
			count: count(movies.uid),
		})
		.from(movies)
		.where(isNotNull(movies.tmdbId))
		.groupBy(movies.tmdbId);

	const actualDuplicates = duplicateTmdbIds.filter((item) => item.count > 1);
	if (actualDuplicates.length > 0) {
		console.log(`\nFound ${actualDuplicates.length} duplicate TMDb IDs:`);
		for (const dup of actualDuplicates) {
			console.log(`- TMDb ID ${dup.tmdbId}: ${dup.count} movies`);
		}
	} else {
		console.log('\nNo duplicate TMDb IDs found.');
	}
}

checkMissingTmdbIds().catch(console.error);
