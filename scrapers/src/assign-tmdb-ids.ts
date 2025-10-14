import {config} from 'dotenv';
import {and, isNotNull, isNull, eq, not} from 'drizzle-orm';
import {getDatabase, type Environment} from '../../src/index';
import {movies} from '../../src/schema/movies';
import {findTMDBByImdbId} from './common/tmdb-utilities';

config({path: '.dev.vars'});

const environment: Environment = {
	TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
	TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
	TMDB_API_KEY: process.env.TMDB_API_KEY!,
	TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN!,
	OMDB_API_KEY: process.env.OMDB_API_KEY!,
};

async function assignTmdbIds() {
	const db = getDatabase(environment);

	console.log('Fetching movies with IMDb ID but no TMDb ID...');
	const moviesWithoutTmdbId = await db
		.select({
			uid: movies.uid,
			imdbId: movies.imdbId,
			year: movies.year,
		})
		.from(movies)
		.where(and(isNotNull(movies.imdbId), isNull(movies.tmdbId)));

	console.log(`Found ${moviesWithoutTmdbId.length} movies to process`);

	let processed = 0;
	let successful = 0;
	let failed = 0;

	for (const movie of moviesWithoutTmdbId) {
		processed++;
		console.log(
			`\n[${processed}/${moviesWithoutTmdbId.length}] Processing movie: ${movie.uid}`,
		);
		console.log(`  IMDb ID: ${movie.imdbId}, Year: ${movie.year}`);

		try {
			if (!environment.TMDB_API_KEY) {
				console.log('  ❌ TMDB_API_KEY is not set');
				continue;
			}

			const tmdbId = await findTMDBByImdbId(
				movie.imdbId!,
				environment.TMDB_API_KEY,
			);

			if (tmdbId) {
				// 重複チェック
				const duplicateMovie = await db
					.select({uid: movies.uid, imdbId: movies.imdbId})
					.from(movies)
					.where(and(eq(movies.tmdbId, tmdbId), not(eq(movies.uid, movie.uid))))
					.limit(1);

				if (duplicateMovie.length > 0) {
					console.log(
						`  ❌ TMDb ID ${tmdbId} already used by movie ${duplicateMovie[0].uid} (IMDb: ${duplicateMovie[0].imdbId})`,
					);
					failed++;
					continue;
				}

				// TMDb IDを更新
				await db.update(movies).set({tmdbId}).where(eq(movies.uid, movie.uid));

				console.log(`  ✅ Assigned TMDb ID: ${tmdbId}`);
				successful++;
			} else {
				console.log(`  ❌ No TMDb ID found for IMDb ID: ${movie.imdbId}`);
				failed++;
			}
		} catch (error) {
			console.error(`  ❌ Error processing movie ${movie.uid}:`, error);
			failed++;
		}

		// Rate limiting: 40 requests per 10 seconds
		if (processed % 40 === 0) {
			console.log('  ⏱️  Rate limiting: waiting 10 seconds...');
			await new Promise((resolve) => {
				setTimeout(resolve, 10_000);
			});
		}
	}

	console.log('\n📊 Summary:');
	console.log(`  Processed: ${processed}`);
	console.log(`  Successful: ${successful}`);
	console.log(`  Failed: ${failed}`);
	console.log(
		`  Success rate: ${((successful / processed) * 100).toFixed(1)}%`,
	);
}

await assignTmdbIds();
