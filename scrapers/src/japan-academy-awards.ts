import * as cheerio from 'cheerio';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '../../src/index';
import {awardCategories} from '../../src/schema/award-categories';
import {awardCeremonies} from '../../src/schema/award-ceremonies';
import {awardOrganizations} from '../../src/schema/award-organizations';
import {movies} from '../../src/schema/movies';
import {nominations} from '../../src/schema/nominations';
import {referenceUrls} from '../../src/schema/reference-urls';
import {translations} from '../../src/schema/translations';
import {seedJapanAcademyAwards} from '../../src/seeds/japan-academy-awards';
import {
	fetchImdbId,
	fetchTMDBMovieImages,
	savePosterUrls,
	saveTMDBId,
	type TMDBFindResponse,
} from './common/tmdb-utilities';

const WIKIPEDIA_BASE_URL = 'https://ja.wikipedia.org';
const MAIN_AWARDS_URL = 'https://ja.wikipedia.org/wiki/日本アカデミー賞作品賞';

type MovieInfo = {
	title: string;
	year: number;
	isWinner: boolean;
	categoryType:
		| 'Best Picture'
		| 'Best Animation'
		| 'Excellent Picture'
		| 'Excellent Animation';
	referenceUrl?: string;
	imdbId?: string;
};

type MainData = {
	organizationUid: string;
	categories: Map<string, string>;
	ceremonies: Map<number, string>;
};

let mainData: MainData | undefined;
let environment_: Environment;
let TMDB_API_KEY: string | undefined;
let isDryRun = false;

export default {
	async fetch(request: Request, environment: Environment): Promise<Response> {
		environment_ = environment;
		TMDB_API_KEY = environment.TMDB_API_KEY;

		const url = new URL(request.url);
		const yearParameter = url.searchParams.get('year');
		const dryRunParameter = url.searchParams.get('dry-run');
		isDryRun = dryRunParameter === 'true';

		if (url.pathname === '/seed') {
			console.log('seeding japan academy awards');
			if (isDryRun) {
				console.log(
					'[DRY RUN] Would seed Japan Academy Awards organization and categories',
				);
			} else {
				await seedJapanAcademyAwards(environment_);
			}

			return new Response('Seed completed successfully', {status: 200});
		}

		try {
			if (isDryRun) {
				console.log(
					'[DRY RUN MODE] No actual database operations will be performed',
				);
			}

			if (yearParameter) {
				const targetYear = Number.parseInt(yearParameter, 10);
				await scrapeJapanAcademyAwardsYear(targetYear);
			} else {
				await scrapeJapanAcademyAwards();
			}

			return new Response('Scraping completed successfully', {status: 200});
		} catch (error) {
			return new Response(
				`Error: ${error instanceof Error ? error.message : String(error)}`,
				{status: 500},
			);
		}
	},
};

async function fetchMainData(): Promise<MainData> {
	if (mainData) {
		return mainData;
	}

	if (isDryRun) {
		// Dry run mode - return mock data
		mainData = {
			organizationUid: 'mock-japan-academy-uid',
			categories: new Map([
				['Best Picture', 'mock-best-picture-uid'],
				['Best Animation', 'mock-best-animation-uid'],
				['Excellent Picture', 'mock-excellent-picture-uid'],
				['Excellent Animation', 'mock-excellent-animation-uid'],
			]),
			ceremonies: new Map(),
		};
		return mainData;
	}

	const [organization] = await getDatabase(environment_)
		.select()
		.from(awardOrganizations)
		.where(eq(awardOrganizations.name, 'Japan Academy Awards'));

	if (!organization) {
		throw new Error('Japan Academy Awards organization not found');
	}

	const categoriesData = await getDatabase(environment_)
		.select()
		.from(awardCategories)
		.where(eq(awardCategories.organizationUid, organization.uid));

	const categories = new Map<string, string>();
	for (const category of categoriesData) {
		if (category.shortName) {
			categories.set(category.shortName, category.uid);
		}
	}

	const ceremoniesData = await getDatabase(environment_)
		.select()
		.from(awardCeremonies)
		.where(eq(awardCeremonies.organizationUid, organization.uid));

	const ceremonies = new Map<number, string>(
		ceremoniesData.map((ceremony) => [ceremony.year, ceremony.uid]),
	);

	mainData = {
		organizationUid: organization.uid,
		categories,
		ceremonies,
	};

	return mainData;
}

async function getOrCreateCeremony(
	year: number,
	organizationUid: string,
): Promise<string> {
	const database = getDatabase(environment_);
	const [ceremony] = await database
		.insert(awardCeremonies)
		.values({
			organizationUid,
			year,
			ceremonyNumber: year - 1976, // 1977年が第1回、2024年が第48回
		})
		.onConflictDoUpdate({
			target: [awardCeremonies.organizationUid, awardCeremonies.year],
			set: {
				ceremonyNumber: year - 1976,
				updatedAt: Math.floor(Date.now() / 1000),
			},
		})
		.returning();

	mainData?.ceremonies.set(year, ceremony.uid);

	return ceremony.uid;
}

export async function scrapeJapanAcademyAwards() {
	try {
		console.log('Fetching data from Japanese Wikipedia main awards page...');

		if (isDryRun) {
			console.log('[DRY RUN MODE] Fetching all Japan Academy Awards data');
		}

		await scrapeMainAwardsPage();
		console.log('Japan Academy Awards scraping completed successfully');
	} catch (error) {
		console.error('Error scraping Japan Academy Awards:', error);
		throw error;
	}
}

export async function scrapeJapanAcademyAwardsYear(year: number) {
	try {
		console.log(`Fetching Japan Academy Awards data for ${year}...`);

		if (isDryRun) {
			console.log(
				`[DRY RUN MODE] Fetching Japan Academy Awards data for ${year}`,
			);
		}

		await scrapeMainAwardsPageForYear(year);
		console.log(`Japan Academy Awards ${year} scraping completed successfully`);
	} catch (error) {
		console.error(`Error scraping Japan Academy Awards ${year}:`, error);
		throw error;
	}
}

async function scrapeMainAwardsPage() {
	console.log(`Fetching ${MAIN_AWARDS_URL}...`);
	const response = await fetch(MAIN_AWARDS_URL);

	if (!response.ok) {
		throw new Error(`Failed to fetch main awards page: ${response.status}`);
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	const movies = extractAllMoviesFromMainPage($);

	// バッチ処理用の配列
	const translationsBatch: Array<typeof translations.$inferInsert> = [];
	const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
	const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

	// 映画を処理
	for (const movie of movies) {
		const batchData = await processMovieForBatch(movie);
		if (batchData) {
			translationsBatch.push(...batchData.translations);
			if (batchData.referenceUrl) {
				referenceUrlsBatch.push(batchData.referenceUrl);
			}

			if (batchData.nomination) {
				nominationsBatch.push(batchData.nomination);
			}
		}
	}

	// バッチでデータを挿入
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

	if (referenceUrlsBatch.length > 0) {
		console.log(
			`Inserting ${referenceUrlsBatch.length} reference URLs in batch...`,
		);
		await database
			.insert(referenceUrls)
			.values(referenceUrlsBatch)
			.onConflictDoNothing();
	}

	if (nominationsBatch.length > 0) {
		console.log(`Inserting ${nominationsBatch.length} nominations in batch...`);
		await database
			.insert(nominations)
			.values(nominationsBatch)
			.onConflictDoNothing();
	}

	console.log(`\nProcessed ${movies.length} movies from Japan Academy Awards`);
}

async function scrapeMainAwardsPageForYear(targetYear: number) {
	console.log(`Fetching ${MAIN_AWARDS_URL}...`);
	const response = await fetch(MAIN_AWARDS_URL);

	if (!response.ok) {
		throw new Error(`Failed to fetch main awards page: ${response.status}`);
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	const movies = extractAllMoviesFromMainPage($).filter(
		(movie) => movie.year === targetYear,
	);

	// バッチ処理用の配列
	const translationsBatch: Array<typeof translations.$inferInsert> = [];
	const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
	const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

	// 映画を処理
	for (const movie of movies) {
		const batchData = await processMovieForBatch(movie);
		if (batchData) {
			translationsBatch.push(...batchData.translations);
			if (batchData.referenceUrl) {
				referenceUrlsBatch.push(batchData.referenceUrl);
			}

			if (batchData.nomination) {
				nominationsBatch.push(batchData.nomination);
			}
		}
	}

	// バッチでデータを挿入
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

	if (referenceUrlsBatch.length > 0) {
		console.log(
			`Inserting ${referenceUrlsBatch.length} reference URLs in batch...`,
		);
		await database
			.insert(referenceUrls)
			.values(referenceUrlsBatch)
			.onConflictDoNothing();
	}

	if (nominationsBatch.length > 0) {
		console.log(`Inserting ${nominationsBatch.length} nominations in batch...`);
		await database
			.insert(nominations)
			.values(nominationsBatch)
			.onConflictDoNothing();
	}

	console.log(
		`\nProcessed ${movies.length} movies for Japan Academy Awards ${targetYear}`,
	);
}

function extractAllMoviesFromMainPage($: cheerio.CheerioAPI): MovieInfo[] {
	const movies: MovieInfo[] = [];

	// 各表を順番に処理
	const tables = $('table').toArray();
	const processedYears = new Set<number>(); // 重複する年を避けるため

	for (const table of tables) {
		const $table = $(table);

		// 表の直前にある要素から具体的な年を探す
		let specificYear: number | undefined;
		let $previousElement = $table.prev();

		// 直前の数個の要素を調べて年を探す
		for (
			let elementIndex = 0;
			elementIndex < 10 && $previousElement.length > 0;
			elementIndex++
		) {
			const previousText = $previousElement.text().trim();

			// 「2024年（第48回）」のようなパターン
			const yearAndCeremonyMatch = /(\d{4})年.*第(\d+)回/.exec(previousText);
			if (yearAndCeremonyMatch) {
				specificYear = Number.parseInt(yearAndCeremonyMatch[1], 10);
				// 2024年の場合は特別処理：テキストから映画を抽出
				if (specificYear === 2024 && !processedYears.has(specificYear)) {
					const moviesFromText = extractMoviesFromText(
						previousText,
						specificYear,
					);
					movies.push(...moviesFromText);
					processedYears.add(specificYear); // 処理済みとしてマーク
				}

				break;
			}

			// 第X回のパターンを探す
			const ceremonyMatch = /第(\d+)回/.exec(previousText);
			if (ceremonyMatch) {
				const ceremonyNumber = Number.parseInt(ceremonyMatch[1], 10);
				specificYear = 1976 + ceremonyNumber;
				break;
			}

			// 西暦年のパターン
			const yearMatch = /(\d{4})年/.exec(previousText);
			if (yearMatch) {
				specificYear = Number.parseInt(yearMatch[1], 10);
				break;
			}

			$previousElement = $previousElement.prev();
		}

		// 年が見つからない場合は、このテーブルをスキップ
		if (!specificYear) {
			continue; // この表をスキップして次の表に進む
		}

		// 重複する年をチェック
		if (processedYears.has(specificYear)) {
			continue;
		}

		// 妥当な年範囲をチェック
		const currentYear = new Date().getFullYear();
		if (specificYear >= 1978 && specificYear <= currentYear) {
			const tableMovies = extractMoviesFromTableWithYear(
				$,
				$table,
				specificYear,
			);
			movies.push(...tableMovies);
			processedYears.add(specificYear); // 処理済みとしてマーク
		}
	}

	return movies;
}

function extractMoviesFromText(text: string, year: number): MovieInfo[] {
	const movies: MovieInfo[] = [];

	// 2024年の映画タイトル
	if (year === 2024) {
		const titles2024 = [
			'侍タイムスリッパー',
			'キングダム 大将軍の帰還',
			'正体',
			'夜明けのすべて',
			'ラストマイル',
		];

		for (const title of titles2024) {
			if (text.includes(title)) {
				// 2024年の最優秀賞は「ゴジラ-1.0」だが、ここで抽出する映画は優秀賞のみ
				movies.push({
					title,
					year,
					isWinner: false, // これらは優秀賞
					categoryType: 'Excellent Picture',
				});
			}
		}
	}

	return movies;
}

function extractMoviesFromTableWithYear(
	$: cheerio.CheerioAPI,

	$table: any,
	year: number,
): MovieInfo[] {
	const movies: MovieInfo[] = [];

	// 表全体のテキストを確認して、統計表かどうかを判定
	const tableText = $table.text();
	// 配給会社や監督の統計表は除外（「回」「回数」などの文字が多数含まれる）
	if (
		tableText.includes('配給会社') ||
		tableText.includes('複数回受賞') ||
		(tableText.match(/\d+回/g) || []).length > 5
	) {
		// 「X回」という表記が5つ以上ある場合は統計表
		return movies;
	}

	// 表の行をチェック

	$table.find('tr').each((_: any, element: any) => {
		const $row = $(element);
		const cells = $row.find('td');

		if (cells.length >= 4) {
			// 4列以上の表（作品名、製作会社、監督、脚本）
			const titleCell = cells.eq(0);
			const titleText = titleCell.text().trim();

			// 映画タイトルを抽出
			let title: string | undefined;

			// 『』で囲まれたタイトル
			const titleMatch = /『([^』]+)』/.exec(titleText);
			if (titleMatch) {
				title = titleMatch[1];
			} else {
				// 『』がない場合も考慮
				const cleanTitle = titleText.replaceAll(/\[.*?]/g, '').trim();
				if (
					cleanTitle &&
					!cleanTitle.includes('作品名') &&
					!cleanTitle.includes('製作') &&
					!cleanTitle.includes('監督') &&
					!cleanTitle.includes('脚本') &&
					cleanTitle.length > 1
				) {
					title = cleanTitle;
				}
			}

			if (title) {
				// 最優秀賞かどうかをチェック
				const cellHtml = titleCell.html() || '';
				const isWinner =
					titleCell.find('b, strong').length > 0 ||
					titleText.includes('**') ||
					cellHtml.includes('<b>') ||
					cellHtml.includes('<strong>');

				// リンクを探す
				let referenceUrl: string | undefined;
				const linkElement = titleCell.find('a').first();
				if (linkElement.length > 0) {
					const href = linkElement.attr('href');
					if (href?.startsWith('/wiki/')) {
						referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
					}
				}

				movies.push({
					title,
					year,
					isWinner,
					categoryType: isWinner ? 'Best Picture' : 'Excellent Picture',
					referenceUrl,
				});
			}
		}
	});

	return movies;
}

async function processMovieForBatch(movieInfo: MovieInfo): Promise<
	| {
			translations: Array<typeof translations.$inferInsert>;
			referenceUrl?: typeof referenceUrls.$inferInsert;
			nomination?: typeof nominations.$inferInsert;
	  }
	| undefined
> {
	try {
		if (isDryRun) {
			console.log(
				`[DRY RUN] Would process movie: ${movieInfo.title} (${
					movieInfo.year
				}) - ${movieInfo.isWinner ? 'Winner' : 'Nominee'} [${
					movieInfo.categoryType
				}]`,
			);
			return undefined;
		}

		const main = await fetchMainData();
		const database = getDatabase(environment_);

		// カテゴリーUIDを取得
		const categoryUid = main.categories.get(movieInfo.categoryType);
		if (!categoryUid) {
			throw new Error(`Category not found: ${movieInfo.categoryType}`);
		}

		// IMDb IDを取得
		let imdbId: string | undefined;
		if (TMDB_API_KEY) {
			imdbId = await fetchImdbId(movieInfo.title, movieInfo.year, TMDB_API_KEY);
		}

		// 既存の映画を検索（タイトルまたはIMDb IDで）
		const existingMoviesByTitle = await database
			.select({
				movies,
				translations,
			})
			.from(movies)
			.innerJoin(
				translations,
				and(
					eq(translations.resourceUid, movies.uid),
					eq(translations.resourceType, 'movie_title'),
					eq(translations.languageCode, 'ja'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(translations.content, movieInfo.title));

		// IMDb IDでも検索
		let existingMovieByImdbId;
		if (imdbId) {
			const result = await database
				.select()
				.from(movies)
				.where(eq(movies.imdbId, imdbId));
			existingMovieByImdbId = result[0];
		}

		// どちらかで既存の映画が見つかった場合
		let existingMovies: typeof existingMoviesByTitle;
		if (existingMoviesByTitle.length > 0) {
			existingMovies = existingMoviesByTitle;
		} else if (existingMovieByImdbId) {
			existingMovies = [
				{
					movies: existingMovieByImdbId,
					translations: existingMoviesByTitle[0]?.translations,
				},
			];
		} else {
			existingMovies = [];
		}

		let movieUid: string;
		const translationsBatch: Array<typeof translations.$inferInsert> = [];

		if (existingMovies.length > 0) {
			// 既存の映画が見つかった場合は更新
			const existingMovie = existingMovies[0].movies;
			movieUid = existingMovie.uid;

			// IMDb IDが新しく取得できた場合は更新（差分チェック付き）
			if (imdbId && !existingMovie.imdbId) {
				await database
					.update(movies)
					.set({
						imdbId,
						updatedAt: Math.floor(Date.now() / 1000),
					})
					.where(eq(movies.uid, movieUid));
				console.log(`Updated IMDb ID for ${movieInfo.title}: ${imdbId}`);
			}
		} else {
			// 新規映画の作成
			const [newMovie] = await database
				.insert(movies)
				.values({
					originalLanguage: 'ja',
					year: movieInfo.year,
					imdbId: imdbId || undefined,
				})
				.returning();

			if (!newMovie) {
				throw new Error(`Failed to create movie: ${movieInfo.title}`);
			}

			movieUid = newMovie.uid;

			// 日本語タイトルをバッチに追加
			translationsBatch.push({
				resourceType: 'movie_title',
				resourceUid: movieUid,
				languageCode: 'ja',
				content: movieInfo.title,
				isDefault: 1,
			});

			// 英語タイトルも取得して追加（IMDb IDがある場合）
			if (imdbId && TMDB_API_KEY) {
				const englishTitle = await fetchEnglishTitleFromTMDB(imdbId);
				if (englishTitle) {
					translationsBatch.push({
						resourceType: 'movie_title',
						resourceUid: movieUid,
						languageCode: 'en',
						content: englishTitle,
						isDefault: 0,
					});
				}
			}
		}

		// 参照URL
		let referenceUrlData: typeof referenceUrls.$inferInsert | undefined;
		if (movieInfo.referenceUrl) {
			referenceUrlData = {
				movieUid,
				url: movieInfo.referenceUrl,
				sourceType: 'wikipedia',
				languageCode: 'ja',
				isPrimary: 1,
			};
		}

		// ポスターの取得・保存（新規映画の場合のみ）
		if (existingMovies.length === 0 && imdbId && TMDB_API_KEY) {
			const movieImages = await fetchTMDBMovieImages(imdbId, TMDB_API_KEY);
			if (movieImages) {
				// TMDB IDを保存（まだ保存されていない場合）
				const currentMovie = await database
					.select({tmdbId: movies.tmdbId})
					.from(movies)
					.where(eq(movies.uid, movieUid))
					.limit(1);

				if (currentMovie.length > 0 && !currentMovie[0].tmdbId) {
					await saveTMDBId(imdbId, movieImages.tmdbId, environment_);
				}

				// ポスターを保存
				const posterCount = await savePosterUrls(
					movieUid,
					movieImages.images.posters,
					environment_,
				);

				if (posterCount > 0) {
					console.log(`  Saved ${posterCount} posters for ${movieInfo.title}`);
				}
			}
		}

		const ceremonyUid = await getOrCreateCeremony(
			movieInfo.year,
			main.organizationUid,
		);

		// ノミネーション
		const nominationData: typeof nominations.$inferInsert = {
			movieUid,
			ceremonyUid,
			categoryUid,
			isWinner: movieInfo.isWinner ? 1 : 0,
		};

		console.log(
			`Processed ${existingMovies.length > 0 ? 'updated' : 'new'} movie: ${
				movieInfo.title
			} (${movieInfo.year}) - ${movieInfo.isWinner ? 'Winner' : 'Nominee'} [${
				movieInfo.categoryType
			}] ${imdbId ? `IMDb: ${imdbId}` : ''}`,
		);

		return {
			translations: translationsBatch,
			referenceUrl: referenceUrlData,
			nomination: nominationData,
		};
	} catch (error) {
		console.error(`Error processing movie ${movieInfo.title}:`, error);
		return undefined;
	}
}

async function processMovie(movieInfo: MovieInfo) {
	try {
		if (isDryRun) {
			console.log(
				`[DRY RUN] Would process movie: ${movieInfo.title} (${
					movieInfo.year
				}) - ${movieInfo.isWinner ? 'Winner' : 'Nominee'} [${
					movieInfo.categoryType
				}]`,
			);
			return;
		}

		const main = await fetchMainData();
		const database = getDatabase(environment_);

		// カテゴリーUIDを取得
		const categoryUid = main.categories.get(movieInfo.categoryType);
		if (!categoryUid) {
			throw new Error(`Category not found: ${movieInfo.categoryType}`);
		}

		// IMDb IDを取得
		let imdbId: string | undefined;
		if (TMDB_API_KEY) {
			imdbId = await fetchImdbId(movieInfo.title, movieInfo.year, TMDB_API_KEY);
		}

		// 既存の映画を検索（タイトルまたはIMDb IDで）
		const existingMoviesByTitle = await database
			.select({
				movies,
				translations,
			})
			.from(movies)
			.innerJoin(
				translations,
				and(
					eq(translations.resourceUid, movies.uid),
					eq(translations.resourceType, 'movie_title'),
					eq(translations.languageCode, 'ja'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(translations.content, movieInfo.title));

		// IMDb IDでも検索
		let existingMovieByImdbId;
		if (imdbId) {
			const result = await database
				.select()
				.from(movies)
				.where(eq(movies.imdbId, imdbId));
			existingMovieByImdbId = result[0];
		}

		// どちらかで既存の映画が見つかった場合
		let existingMovies: typeof existingMoviesByTitle;
		if (existingMoviesByTitle.length > 0) {
			existingMovies = existingMoviesByTitle;
		} else if (existingMovieByImdbId) {
			existingMovies = [
				{
					movies: existingMovieByImdbId,
					translations: existingMoviesByTitle[0]?.translations,
				},
			];
		} else {
			existingMovies = [];
		}

		let movieUid: string;

		if (existingMovies.length > 0) {
			// 既存の映画が見つかった場合は更新
			const existingMovie = existingMovies[0].movies;
			movieUid = existingMovie.uid;

			// IMDb IDが新しく取得できた場合は更新
			if (imdbId && !existingMovie.imdbId) {
				await database
					.update(movies)
					.set({
						imdbId,
						updatedAt: Math.floor(Date.now() / 1000),
					})
					.where(eq(movies.uid, movieUid));
				console.log(`Updated IMDb ID for ${movieInfo.title}: ${imdbId}`);
			}
		} else {
			// 新規映画の作成
			const [newMovie] = await database
				.insert(movies)
				.values({
					originalLanguage: 'ja',
					year: movieInfo.year,
					imdbId: imdbId || undefined,
				})
				.returning();

			if (!newMovie) {
				throw new Error(`Failed to create movie: ${movieInfo.title}`);
			}

			movieUid = newMovie.uid;

			// 日本語タイトルを追加
			await database.insert(translations).values({
				resourceType: 'movie_title',
				resourceUid: movieUid,
				languageCode: 'ja',
				content: movieInfo.title,
				isDefault: 1,
			});

			// 英語タイトルも取得して追加（IMDb IDがある場合）
			if (imdbId && TMDB_API_KEY) {
				const englishTitle = await fetchEnglishTitleFromTMDB(imdbId);
				if (englishTitle) {
					await database.insert(translations).values({
						resourceType: 'movie_title',
						resourceUid: movieUid,
						languageCode: 'en',
						content: englishTitle,
						isDefault: 0,
					});
				}
			}
		}

		// 参照URLの追加（重複の場合は無視）
		if (movieInfo.referenceUrl) {
			await database
				.insert(referenceUrls)
				.values({
					movieUid,
					url: movieInfo.referenceUrl,
					sourceType: 'wikipedia',
					languageCode: 'ja',
					isPrimary: 1,
				})
				.onConflictDoNothing();
		}

		// ポスターの取得・保存
		if (imdbId && TMDB_API_KEY) {
			const movieImages = await fetchTMDBMovieImages(imdbId, TMDB_API_KEY);
			if (movieImages) {
				// TMDB IDを保存（まだ保存されていない場合）
				const currentMovie = await database
					.select({tmdbId: movies.tmdbId})
					.from(movies)
					.where(eq(movies.uid, movieUid))
					.limit(1);

				if (currentMovie.length > 0 && !currentMovie[0].tmdbId) {
					await saveTMDBId(imdbId, movieImages.tmdbId, environment_);
				}

				// ポスターを保存
				const posterCount = await savePosterUrls(
					movieUid,
					movieImages.images.posters,
					environment_,
				);

				if (posterCount > 0) {
					console.log(`  Saved ${posterCount} posters for ${movieInfo.title}`);
				}
			}
		}

		const ceremonyUid = await getOrCreateCeremony(
			movieInfo.year,
			main.organizationUid,
		);

		// ノミネーション情報の更新または追加
		await database
			.insert(nominations)
			.values({
				movieUid,
				ceremonyUid,
				categoryUid,
				isWinner: movieInfo.isWinner ? 1 : 0,
			})
			.onConflictDoUpdate({
				target: [
					nominations.movieUid,
					nominations.ceremonyUid,
					nominations.categoryUid,
				],
				set: {
					isWinner: movieInfo.isWinner ? 1 : 0,
					updatedAt: Math.floor(Date.now() / 1000),
				},
			});

		console.log(
			`Processed ${existingMovies.length > 0 ? 'updated' : 'new'} movie: ${
				movieInfo.title
			} (${movieInfo.year}) - ${movieInfo.isWinner ? 'Winner' : 'Nominee'} [${
				movieInfo.categoryType
			}] ${imdbId ? `IMDb: ${imdbId}` : ''}`,
		);
	} catch (error) {
		console.error(`Error processing movie ${movieInfo.title}:`, error);
		throw error;
	}
}

async function fetchEnglishTitleFromTMDB(
	imdbId: string,
): Promise<string | undefined> {
	const TMDB_API_KEY_LOCAL = TMDB_API_KEY;
	if (!TMDB_API_KEY_LOCAL) {
		return undefined;
	}

	try {
		const findUrl = new URL('https://api.themoviedb.org/3/find/' + imdbId);
		findUrl.searchParams.append('api_key', TMDB_API_KEY_LOCAL);
		findUrl.searchParams.append('external_source', 'imdb_id');

		const response = await fetch(findUrl.toString());
		if (!response.ok) {
			return undefined;
		}

		const data: {
			movie_results?: Array<{title: string}>;
		} = await response.json();
		const movieResults = data.movie_results;

		if (!movieResults || movieResults.length === 0) {
			return undefined;
		}

		return movieResults[0].title;
	} catch (error) {
		console.error(`Error fetching English title for IMDb ID ${imdbId}:`, error);
		return undefined;
	}
}
