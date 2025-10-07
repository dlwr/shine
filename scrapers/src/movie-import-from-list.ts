import {readFileSync} from 'node:fs';
import {and, eq, or} from 'drizzle-orm';
import {getDatabase, type Environment} from '../../src/index';
import {awardCategories} from '../../src/schema/award-categories';
import {awardCeremonies} from '../../src/schema/award-ceremonies';
import {awardOrganizations} from '../../src/schema/award-organizations';
import {movies} from '../../src/schema/movies';
import {nominations} from '../../src/schema/nominations';
import {posterUrls} from '../../src/schema/poster-urls';
import {translations} from '../../src/schema/translations';
import {generateUUID} from '../../src/utils/uuid';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

type TMDBMovieData = {
	id: number;
	title: string;
	original_title: string;
	release_date: string;
	poster_path: string | undefined;
	imdb_id: string | undefined;
	overview: string;
};

type TMDBMovieSearchResult = {
	id: number;
	title: string;
	original_title?: string;
	release_date?: string;
	poster_path?: string;
	imdb_id?: string;
	overview?: string;
};

type TMDBSearchResponse = {
	results: TMDBMovieSearchResult[];
	total_results: number;
};

type TMDBConfiguration = {
	images: {
		secure_base_url: string;
		poster_sizes: string[];
	};
};

let environment_: Environment;
let TMDB_API_KEY: string;
let tmdbConfiguration: TMDBConfiguration | undefined;
let isDryRun = false;

/**
 * Movie-list.jsonから映画をインポートする
 */
export async function importMoviesFromList(
	filePath: string,
	awardName: string,
	categoryName: string,
	environment: Environment,
	limit?: number,
	dryRun = false,
): Promise<void> {
	isDryRun = dryRun;
	environment_ = environment;
	TMDB_API_KEY = environment.TMDB_API_KEY || '';

	if (!TMDB_API_KEY) {
		throw new Error('TMDB_API_KEY is required');
	}

	// TMDB設定を取得
	await fetchTMDBConfiguration();

	// JSONファイルを読み込み
	const fileContent = readFileSync(filePath, 'utf8');
	const allMovieTitles: string[] = JSON.parse(fileContent);

	// Limitが指定されている場合は制限
	const movieTitles = limit ? allMovieTitles.slice(0, limit) : allMovieTitles;

	if (isDryRun) {
		console.log(
			'[DRY RUN MODE] No actual database operations will be performed',
		);
	}

	console.log(
		`${isDryRun ? '[DRY RUN] Would import' : 'Importing'} ${movieTitles.length}${
			limit ? ` (limited from ${allMovieTitles.length})` : ''
		} movies from ${filePath}`,
	);

	// アワード組織とカテゴリーを作成
	const {organizationUid, categoryUid, ceremonyUid} =
		await createAwardStructure(awardName, categoryName);

	// バッチ処理用の配列
	const translationsBatch: Array<typeof translations.$inferInsert> = [];
	const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];
	const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

	// 各映画を処理
	for (const [index, title] of movieTitles.entries()) {
		console.log(`\n[${index + 1}/${movieTitles.length}] Processing: ${title}`);

		try {
			const batchData = await processMovieForBatch(
				title,
				organizationUid,
				categoryUid,
				ceremonyUid,
			);
			if (batchData) {
				translationsBatch.push(...batchData.translations);
				if (batchData.posterUrl) {
					posterUrlsBatch.push(batchData.posterUrl);
				}

				if (batchData.nomination) {
					nominationsBatch.push(batchData.nomination);
				}
			}
		} catch (error) {
			console.error(`Error processing ${title}:`, error);
		}
	}

	// バッチでデータを挿入
	if (isDryRun) {
		console.log(`\n[DRY RUN] Would insert:`);
		console.log(`  - ${translationsBatch.length} translations`);
		console.log(`  - ${posterUrlsBatch.length} poster URLs`);
		console.log(`  - ${nominationsBatch.length} nominations`);
	} else {
		const database = getDatabase(environment_);

		if (translationsBatch.length > 0) {
			console.log(
				`\nInserting ${translationsBatch.length} translations in batch...`,
			);
			await database
				.insert(translations)
				.values(translationsBatch)
				.onConflictDoNothing();
		}

		if (posterUrlsBatch.length > 0) {
			console.log(
				`Inserting ${posterUrlsBatch.length} poster URLs in batch...`,
			);
			await database
				.insert(posterUrls)
				.values(posterUrlsBatch)
				.onConflictDoNothing();
		}

		if (nominationsBatch.length > 0) {
			console.log(
				`Inserting ${nominationsBatch.length} nominations in batch...`,
			);
			await database
				.insert(nominations)
				.values(nominationsBatch)
				.onConflictDoNothing();
		}
	}

	console.log(`\n${isDryRun ? '[DRY RUN] ' : ''}Import completed!`);
}

/**
 * アワード組織、カテゴリー、セレモニーを作成
 */
async function createAwardStructure(
	awardName: string,
	categoryName: string,
): Promise<{
	organizationUid: string;
	categoryUid: string;
	ceremonyUid: string;
}> {
	if (isDryRun) {
		console.log(
			`[DRY RUN] Would create award structure for: ${awardName} - ${categoryName}`,
		);
		return {
			organizationUid: 'dry-run-org-uid',
			categoryUid: 'dry-run-category-uid',
			ceremonyUid: 'dry-run-ceremony-uid',
		};
	}

	const database = getDatabase(environment_);

	// 組織を作成/取得
	await database
		.insert(awardOrganizations)
		.values({
			name: awardName,
			country: 'Unknown',
			establishedYear: undefined,
		})
		.onConflictDoNothing();

	const [organization] = await database
		.select()
		.from(awardOrganizations)
		.where(eq(awardOrganizations.name, awardName));

	if (!organization) {
		throw new Error(`Failed to create organization: ${awardName}`);
	}

	// カテゴリーを作成/取得
	await database
		.insert(awardCategories)
		.values({
			organizationUid: organization.uid,
			name: categoryName,
			shortName: categoryName,
		})
		.onConflictDoNothing();

	const [category] = await database
		.select()
		.from(awardCategories)
		.where(
			and(
				eq(awardCategories.name, categoryName),
				eq(awardCategories.organizationUid, organization.uid),
			),
		);

	if (!category) {
		throw new Error(`Failed to create category: ${categoryName}`);
	}

	// セレモニーを作成/取得
	const currentYear = new Date().getFullYear();
	await database
		.insert(awardCeremonies)
		.values({
			organizationUid: organization.uid,
			year: currentYear,
			startDate: Math.floor(Date.now() / 1000),
		})
		.onConflictDoNothing();

	const [ceremony] = await database
		.select()
		.from(awardCeremonies)
		.where(
			and(
				eq(awardCeremonies.year, currentYear),
				eq(awardCeremonies.organizationUid, organization.uid),
			),
		);

	if (!ceremony) {
		throw new Error(`Failed to create ceremony for year: ${currentYear}`);
	}

	return {
		organizationUid: organization.uid,
		categoryUid: category.uid,
		ceremonyUid: ceremony.uid,
	};
}

/**
 * バッチ処理用に映画を処理
 */
async function processMovieForBatch(
	title: string,
	_organizationUid: string,
	categoryUid: string,
	ceremonyUid: string,
): Promise<
	| {
			translations: Array<typeof translations.$inferInsert>;
			posterUrl?: typeof posterUrls.$inferInsert;
			nomination?: typeof nominations.$inferInsert;
	  }
	| undefined
> {
	// TMDBで映画を検索
	const tmdbMovie = await searchMovieOnTMDB(title);

	if (!tmdbMovie) {
		console.log(`  TMDB search failed for: ${title}`);
		return undefined;
	}

	if (isDryRun) {
		console.log(
			`[DRY RUN] Would process movie: ${tmdbMovie.title} (${tmdbMovie.release_date?.split('-')[0]}) ${
				tmdbMovie.imdb_id ? `IMDb: ${tmdbMovie.imdb_id}` : ''
			}`,
		);
		return undefined;
	}

	const database = getDatabase(environment_);

	// 既存の映画をチェック（TMDB IDまたはIMDb IDで）
	let existingMovie: typeof movies.$inferSelect | undefined;

	if (tmdbMovie.imdb_id) {
		[existingMovie] = await database
			.select()
			.from(movies)
			.where(
				or(
					eq(movies.tmdbId, tmdbMovie.id),
					eq(movies.imdbId, tmdbMovie.imdb_id),
				),
			)
			.limit(1);
	} else {
		[existingMovie] = await database
			.select()
			.from(movies)
			.where(eq(movies.tmdbId, tmdbMovie.id))
			.limit(1);
	}

	let movieUid: string;
	const translationsBatch: Array<typeof translations.$inferInsert> = [];
	let posterUrlData: typeof posterUrls.$inferInsert | undefined;

	if (existingMovie) {
		console.log(`  Found existing movie (UID: ${existingMovie.uid})`);
		movieUid = existingMovie.uid;

		// TMDBデータで既存映画を更新
		await updateExistingMovie(existingMovie.uid, tmdbMovie);
	} else {
		console.log(`  Creating new movie: ${tmdbMovie.title}`);
		const result = await createNewMovieForBatch(tmdbMovie);
		movieUid = result.movieUid;
		translationsBatch.push(...result.translations);
		posterUrlData = result.posterUrl;
	}

	// 既存のノミネーションをチェック
	const [existingNomination] = await database
		.select()
		.from(nominations)
		.where(
			and(
				eq(nominations.movieUid, movieUid),
				eq(nominations.categoryUid, categoryUid),
				eq(nominations.ceremonyUid, ceremonyUid),
			),
		)
		.limit(1);

	let nominationData: typeof nominations.$inferInsert | undefined;
	if (existingNomination) {
		console.log(`  Nomination already exists`);
	} else {
		nominationData = {
			movieUid,
			categoryUid,
			ceremonyUid,
			isWinner: 0,
		};
		console.log(`  Added nomination to batch`);
	}

	return {
		translations: translationsBatch,
		posterUrl: posterUrlData,
		nomination: nominationData,
	};
}

/**
 * TMDBで映画を検索
 */
async function searchMovieOnTMDB(
	title: string,
): Promise<TMDBMovieData | undefined> {
	try {
		const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
		searchUrl.searchParams.append('api_key', TMDB_API_KEY);
		searchUrl.searchParams.append('query', title);
		searchUrl.searchParams.append('language', 'ja');

		const response = await fetch(searchUrl.toString());
		if (!response.ok) {
			throw new Error(`TMDB API error: ${response.statusText}`);
		}

		const data: TMDBSearchResponse = await response.json();

		if (data.results.length === 0) {
			return undefined;
		}

		// 最初の結果を返す（最も関連性が高いとされる）
		const movie = data.results[0];
		const sanitizedMovie: TMDBMovieData = {
			id: movie.id,
			title: movie.title,
			original_title: movie.original_title ?? movie.title,
			release_date: movie.release_date ?? '',
			poster_path: movie.poster_path ?? undefined,
			imdb_id: movie.imdb_id ?? undefined,
			overview: movie.overview ?? '',
		};
		console.log(
			`  Found on TMDB: ${sanitizedMovie.title} (${
				sanitizedMovie.release_date.split('-')[0] || 'Unknown'
			})`,
		);

		return sanitizedMovie;
	} catch (error) {
		console.error(`Error searching TMDB for ${title}:`, error);
		return undefined;
	}
}

/**
 * バッチ処理用に新しい映画を作成
 */
async function createNewMovieForBatch(tmdbMovie: TMDBMovieData): Promise<{
	movieUid: string;
	translations: Array<typeof translations.$inferInsert>;
	posterUrl?: typeof posterUrls.$inferInsert;
}> {
	const database = getDatabase(environment_);
	const movieUid = generateUUID();

	// 公開年を抽出
	const releaseYear = tmdbMovie.release_date
		? Number.parseInt(tmdbMovie.release_date.split('-')[0], 10)
		: undefined;

	// 映画を作成（これは即座に実行する必要がある）
	await database.insert(movies).values({
		uid: movieUid,
		originalLanguage: 'en', // Default to English for TMDB movies
		year: releaseYear,
		tmdbId: tmdbMovie.id,
		imdbId: tmdbMovie.imdb_id,
	});

	const translationsBatch: Array<typeof translations.$inferInsert> = [];

	// 英語原題翻訳を追加（デフォルト）
	if (tmdbMovie.original_title) {
		console.log(`  Saving EN title: "${tmdbMovie.original_title}"`);
		translationsBatch.push({
			resourceType: 'movie_title',
			resourceUid: movieUid,
			languageCode: 'en',
			content: tmdbMovie.original_title,
			isDefault: 1,
		});
	} else {
		console.log(`  WARN: tmdbMovie.original_title is undefined!`);
	}

	// 日本語翻訳を追加
	if (tmdbMovie.title !== tmdbMovie.original_title) {
		console.log(`  Adding JA title: "${tmdbMovie.title}"`);
		translationsBatch.push({
			resourceType: 'movie_title',
			resourceUid: movieUid,
			languageCode: 'ja',
			content: tmdbMovie.title,
			isDefault: 0,
		});
	}

	// ポスターURL
	let posterUrlData: typeof posterUrls.$inferInsert | undefined;
	if (tmdbMovie.poster_path && tmdbConfiguration) {
		const posterUrl = `${tmdbConfiguration.images.secure_base_url}w500${tmdbMovie.poster_path}`;
		posterUrlData = {
			movieUid,
			url: posterUrl,
			sourceType: 'tmdb',
		};
	}

	return {
		movieUid,
		translations: translationsBatch,
		posterUrl: posterUrlData,
	};
}

/**
 * 既存の映画を更新（差分チェック付き）
 */
async function updateExistingMovie(
	movieUid: string,
	tmdbMovie: TMDBMovieData,
): Promise<void> {
	const database = getDatabase(environment_);

	// 既存の映画データを取得
	const [existingMovie] = await database
		.select()
		.from(movies)
		.where(eq(movies.uid, movieUid))
		.limit(1);

	if (!existingMovie) {
		return;
	}

	// 差分チェックして更新が必要な場合のみ更新
	const updates: Partial<typeof movies.$inferInsert> = {};

	if (!existingMovie.tmdbId && tmdbMovie.id) {
		updates.tmdbId = tmdbMovie.id;
	}

	if (!existingMovie.imdbId && tmdbMovie.imdb_id) {
		updates.imdbId = tmdbMovie.imdb_id;
	}

	if (Object.keys(updates).length > 0) {
		console.log(`  Updating movie with: ${JSON.stringify(updates)}`);
		await database.update(movies).set(updates).where(eq(movies.uid, movieUid));
	}

	// ポスターURLを追加（まだない場合）
	if (tmdbMovie.poster_path && tmdbConfiguration) {
		const [existingPoster] = await database
			.select()
			.from(posterUrls)
			.where(eq(posterUrls.movieUid, movieUid))
			.limit(1);

		if (!existingPoster) {
			const posterUrl = `${tmdbConfiguration.images.secure_base_url}w500${tmdbMovie.poster_path}`;
			await database.insert(posterUrls).values({
				movieUid,
				url: posterUrl,
				sourceType: 'tmdb',
			});
		}
	}
}

/**
 * TMDB設定を取得
 */
async function fetchTMDBConfiguration(): Promise<void> {
	try {
		const configUrl = new URL(`${TMDB_API_BASE_URL}/configuration`);
		configUrl.searchParams.append('api_key', TMDB_API_KEY);

		const response = await fetch(configUrl.toString());
		if (!response.ok) {
			throw new Error(`TMDB configuration API error: ${response.statusText}`);
		}

		tmdbConfiguration = await response.json();
		console.log('TMDB configuration loaded');
	} catch (error) {
		console.error('Error fetching TMDB configuration:', error);
		throw error;
	}
}
