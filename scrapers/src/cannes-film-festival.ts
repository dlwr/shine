import * as cheerio from 'cheerio';
import {Element} from 'domhandler';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '../../src/index';
import {awardCategories} from '../../src/schema/award-categories';
import {awardCeremonies} from '../../src/schema/award-ceremonies';
import {awardOrganizations} from '../../src/schema/award-organizations';
import {movies} from '../../src/schema/movies';
import {nominations} from '../../src/schema/nominations';
import {posterUrls} from '../../src/schema/poster-urls';
import {referenceUrls} from '../../src/schema/reference-urls';
import {translations} from '../../src/schema/translations';
import type {
	TMDBSearchResponse,
	TMDBTranslationsResponse,
	TMDBMovieData,
} from './common/tmdb-utilities';

const WIKIPEDIA_BASE_URL = 'https://en.wikipedia.org';
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

type MovieInfo = {
	title: string;
	year: number;
	isWinner: boolean;
	referenceUrl?: string;
	director?: string;
	country?: string;
};

type MasterData = {
	organizationUid: string;
	palmeDOrCategoryUid: string;
	grandPrixCategoryUid: string;
	ceremonies: Map<number, string>;
};

let masterData: MasterData | undefined;
let environment_: Environment;
let TMDB_API_KEY: string | undefined;
let tmdbConfiguration: TMDatabaseConfiguration | undefined;

export default {
	async fetch(request: Request, environment: Environment): Promise<Response> {
		environment_ = environment;
		TMDB_API_KEY = environment.TMDB_API_KEY;

		const url = new URL(request.url);
		const yearParameter = url.searchParams.get('year');
		const winnersOnlyParameter = url.searchParams.get('winners-only');

		try {
			if (winnersOnlyParameter === 'true') {
				// 受賞作品のみ更新
				if (yearParameter) {
					const targetYear = Number.parseInt(yearParameter, 10);
					await updateCannesWinnersOnly(targetYear);
				} else {
					await updateAllCannesWinnersOnly();
				}
			} else {
				// 通常のスクレイピング
				if (yearParameter) {
					const targetYear = Number.parseInt(yearParameter, 10);
					await scrapeCannesFilmFestivalYear(targetYear);
				} else {
					await scrapeCannesFilmFestival();
				}
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

async function seedCannesOrganization(): Promise<void> {
	const database = getDatabase(environment_);

	// カンヌ映画祭の組織を作成
	await database
		.insert(awardOrganizations)
		.values({
			name: 'Cannes Film Festival',
			country: 'France',
			establishedYear: 1946,
		})
		.onConflictDoNothing();

	const [organization] = await database
		.select()
		.from(awardOrganizations)
		.where(eq(awardOrganizations.name, 'Cannes Film Festival'));

	if (!organization) {
		throw new Error('Failed to create Cannes Film Festival organization');
	}

	// Palme d'Or カテゴリーを作成
	await database
		.insert(awardCategories)
		.values({
			organizationUid: organization.uid,
			name: "Palme d'Or",
			shortName: "Palme d'Or",
		})
		.onConflictDoNothing();

	// Grand Prix カテゴリーを作成
	await database
		.insert(awardCategories)
		.values({
			organizationUid: organization.uid,
			name: 'Grand Prix',
			shortName: 'Grand Prix',
		})
		.onConflictDoNothing();
}

async function fetchMasterData(): Promise<MasterData> {
	if (masterData) return masterData;

	// 組織が存在しない場合は作成
	await seedCannesOrganization();

	const [organization] = await getDatabase(environment_)
		.select()
		.from(awardOrganizations)
		.where(eq(awardOrganizations.name, 'Cannes Film Festival'));

	if (!organization) {
		throw new Error('Cannes Film Festival organization not found');
	}

	const categories = await getDatabase(environment_)
		.select()
		.from(awardCategories)
		.where(eq(awardCategories.organizationUid, organization.uid));

	const palmeDOr = categories.find((cat) => cat.shortName === "Palme d'Or");
	const grandPrix = categories.find((cat) => cat.shortName === 'Grand Prix');

	if (!palmeDOr || !grandPrix) {
		throw new Error('Required categories not found');
	}

	const ceremoniesData = await getDatabase(environment_)
		.select()
		.from(awardCeremonies)
		.where(eq(awardCeremonies.organizationUid, organization.uid));

	const ceremonies = new Map<number, string>(
		ceremoniesData.map((ceremony) => [ceremony.year, ceremony.uid]),
	);

	masterData = {
		organizationUid: organization.uid,
		palmeDOrCategoryUid: palmeDOr.uid,
		grandPrixCategoryUid: grandPrix.uid,
		ceremonies,
	};

	return masterData;
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
			ceremonyNumber: year - 1946 + 1, // カンヌ映画祭は1946年開始
		})
		.onConflictDoUpdate({
			target: [awardCeremonies.organizationUid, awardCeremonies.year],
			set: {
				ceremonyNumber: year - 1946 + 1,
				updatedAt: Math.floor(Date.now() / 1000),
			},
		})
		.returning();

	masterData?.ceremonies.set(year, ceremony.uid);

	return ceremony.uid;
}

export async function scrapeCannesFilmFestival() {
	try {
		const master = await fetchMasterData();

		// 各年のカンヌ映画祭をスクレイピング
		const currentYear = new Date().getFullYear();
		for (let year = currentYear; year >= 1946; year--) {
			console.log(`\nProcessing Cannes ${year}...`);

			try {
				const movies = await scrapeYearPage(year);
				const ceremonyUid = await getOrCreateCeremony(
					year,
					master.organizationUid,
				);

				// バッチ処理のためのデータを収集
				const translationsBatch: Array<typeof translations.$inferInsert> = [];
				const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];
				const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
				const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

				for (const movie of movies) {
					const batchData = await processMovieForBatch(
						movie,
						ceremonyUid,
						master,
					);
					if (batchData) {
						translationsBatch.push(...batchData.translations);
						posterUrlsBatch.push(...batchData.posterUrls);
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
						`Inserting ${translationsBatch.length} translations in batch...`,
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
					console.log(
						`Inserting ${nominationsBatch.length} nominations in batch...`,
					);
					await database
						.insert(nominations)
						.values(nominationsBatch)
						.onConflictDoNothing();
				}

				console.log(`Processed ${movies.length} movies for ${year}`);
			} catch (error) {
				console.error(`Error processing year ${year}:`, error);
				// Continue with next year
			}

			// 短い遅延を入れてサーバーに負荷をかけないようにする
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		console.log('Cannes Film Festival scraping completed successfully');
	} catch (error) {
		console.error('Error scraping Cannes Film Festival:', error);
		throw error;
	}
}

export async function scrapeCannesFilmFestivalYear(year: number) {
	try {
		const master = await fetchMasterData();

		console.log(`Processing Cannes ${year}...`);

		const movies = await scrapeYearPage(year);
		const ceremonyUid = await getOrCreateCeremony(year, master.organizationUid);

		// バッチ処理のためのデータを収集
		const translationsBatch: Array<typeof translations.$inferInsert> = [];
		const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];
		const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
		const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

		for (const movie of movies) {
			const batchData = await processMovieForBatch(movie, ceremonyUid, master);
			if (batchData) {
				translationsBatch.push(...batchData.translations);
				posterUrlsBatch.push(...batchData.posterUrls);
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
				`Inserting ${translationsBatch.length} translations in batch...`,
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
			console.log(
				`Inserting ${nominationsBatch.length} nominations in batch...`,
			);
			await database
				.insert(nominations)
				.values(nominationsBatch)
				.onConflictDoNothing();
		}

		console.log(`Processed ${movies.length} movies for ${year}`);
		console.log(`Cannes ${year} scraping completed successfully`);
	} catch (error) {
		console.error(`Error scraping Cannes ${year}:`, error);
		throw error;
	}
}

async function scrapeYearPage(year: number): Promise<MovieInfo[]> {
	// まず年ごとのカンヌ映画祭のページを取得
	const yearUrl = `${WIKIPEDIA_BASE_URL}/wiki/${year}_Cannes_Film_Festival`;

	console.log(`Fetching ${yearUrl}...`);
	const response = await fetch(yearUrl);

	if (!response.ok) {
		console.log(`Page not found for ${year}, skipping...`);
		return [];
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	const movies: MovieInfo[] = [];

	// In Competition セクションを探す
	const competitionSection = findCompetitionSection($);
	if (!competitionSection) {
		console.log(`No competition section found for ${year}`);
		return movies;
	}

	// 映画リストを取得
	const movieList = extractMoviesFromSection($, competitionSection, year);
	movies.push(...movieList);

	// Palme d'Or 受賞作を特定
	const palmeDOrWinner = findPalmeDOrWinner($, year);
	if (palmeDOrWinner) {
		// 既存のリストから該当する映画を見つけて更新
		const existingMovie = movies.find((m) => m.title === palmeDOrWinner.title);
		if (existingMovie) {
			existingMovie.isWinner = true;
		} else {
			movies.push(palmeDOrWinner);
		}
	}

	return movies;
}

function findCompetitionSection(
	$: cheerio.CheerioAPI,
): cheerio.Cheerio<Element> | undefined {
	// すべてのテーブルをチェック
	const tables = $('table.wikitable');
	console.log(`Found ${tables.length} wikitable(s)`);

	for (const [index, tableElement] of tables.toArray().entries()) {
		const table = $(tableElement);
		const headers = table.find('tr').first().find('th');
		const headerTexts = headers
			.map((_, element) => $(element).text().toLowerCase())
			.get();

		console.log(`Table ${index} headers: ${headerTexts.join(' | ')}`);

		// 映画のテーブルかどうかを判定
		const hasFilmHeaders = headerTexts.some(
			(header) =>
				header.includes('title') ||
				header.includes('film') ||
				header.includes('director'),
		);

		const hasPersonHeaders = headerTexts.some(
			(header) =>
				header.includes('jury') ||
				header.includes('member') ||
				header.includes('president'),
		);

		if (hasFilmHeaders && !hasPersonHeaders) {
			console.log(`Found films table at index ${index}`);
			return table;
		}
	}

	// テーブルが見つからない場合、セクションヘッダーの後を探す
	const headings = $('h2, h3, h4');

	for (const heading of headings.toArray()) {
		const $heading = $(heading);
		const text = $heading.text().toLowerCase();

		if (text.includes('film') || text.includes('official selection')) {
			console.log(`Found potential films heading: "${$heading.text()}"`);

			// ヘッダーの後にある要素を探す
			let nextElement = $heading.parent().next();

			let attempts = 0;
			while (nextElement.length > 0 && attempts < 15) {
				if (nextElement.is('table')) {
					const headers = nextElement.find('tr').first().find('th');
					const headerTexts = headers
						.map((_, element) => $(element).text().toLowerCase())
						.get();

					const hasFilmHeaders = headerTexts.some(
						(header) => header.includes('title') || header.includes('director'),
					);

					if (hasFilmHeaders) {
						console.log('Found films table after heading');
						return nextElement;
					}
				}

				const childTable = nextElement.find('table').first();
				if (childTable.length > 0) {
					const headers = childTable.find('tr').first().find('th');
					const headerTexts = headers
						.map((_, element) => $(element).text().toLowerCase())
						.get();

					const hasFilmHeaders = headerTexts.some(
						(header) => header.includes('title') || header.includes('director'),
					);

					if (hasFilmHeaders) {
						console.log('Found films table inside element');
						return childTable;
					}
				}

				if (nextElement.is('h2, h3, h4')) {
					console.log('Reached next heading, stopping search');
					break;
				}

				nextElement = nextElement.next();
				attempts++;
			}
		}
	}

	console.log('No films table found');
	return undefined;
}

function extractMoviesFromSection(
	_$: cheerio.CheerioAPI,
	section: cheerio.Cheerio<Element>,
	year: number,
): MovieInfo[] {
	const movies: MovieInfo[] = [];

	if (section.is('ul, ol')) {
		// リスト形式の場合
		section.find('li').each((_, element) => {
			const movieInfo = parseMovieListItem(_$, _$(element), year);
			if (movieInfo) {
				movies.push(movieInfo);
			}
		});
	} else if (section.is('table')) {
		// テーブル形式の場合
		section.find('tr').each((index, element) => {
			if (index === 0) return; // ヘッダー行をスキップ

			const movieInfo = parseMovieTableRow(_$, _$(element), year);
			if (movieInfo) {
				movies.push(movieInfo);
			}
		});
	}

	return movies;
}

function parseMovieListItem(
	_$: cheerio.CheerioAPI,
	$item: cheerio.Cheerio<Element>,
	year: number,
): MovieInfo | undefined {
	const text = $item.text();

	// イタリック体のタイトルを探す
	const titleElement = $item.find('i').first();
	const linkElement = $item.find('a').first();

	let title = '';
	let referenceUrl: string | undefined;

	if (titleElement.length > 0) {
		title = titleElement.text().trim();
	} else if (linkElement.length > 0) {
		title = linkElement.text().trim();
		const href = linkElement.attr('href');
		if (href) {
			referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
		}
	} else {
		// タイトルをテキストから抽出
		const match = /^([^–—-]+)/.exec(text);
		if (match) {
			title = match[1].trim();
		}
	}

	if (!title) return undefined;

	// 監督を抽出
	let director: string | undefined;
	const directorMatch = /(?:directed by|by|–|—)\s*([^,\n]+)/i.exec(text);
	if (directorMatch) {
		director = directorMatch[1].trim();
	}

	return {
		title: cleanupTitle(title),
		year,
		isWinner: false,
		referenceUrl,
		director,
	};
}

function parseMovieTableRow(
	_$: cheerio.CheerioAPI,
	$row: cheerio.Cheerio<Element>,
	year: number,
): MovieInfo | undefined {
	const cells = $row.find('td');
	if (cells.length < 2) return undefined;

	// 通常、最初のセルがタイトル、2番目が監督
	const titleCell = cells.eq(0);
	const directorCell = cells.eq(1);

	const titleElement = titleCell.find('i').first();
	const linkElement = titleCell.find('a').first();

	let title = '';
	let referenceUrl: string | undefined;

	if (titleElement.length > 0) {
		title = titleElement.text().trim();
	} else if (linkElement.length > 0) {
		title = linkElement.text().trim();
		const href = linkElement.attr('href');
		if (href) {
			referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
		}
	} else {
		title = titleCell.text().trim();
	}

	if (!title) return undefined;

	const director = directorCell.text().trim() || undefined;

	return {
		title: cleanupTitle(title),
		year,
		isWinner: false,
		referenceUrl,
		director,
	};
}

function findPalmeDOrWinner(
	$: cheerio.CheerioAPI,
	year: number,
): MovieInfo | undefined {
	// まずinfoboxでPalme d'Orを探す
	const infoBox = $('.infobox');

	if (infoBox.length > 0) {
		const rows = infoBox.find('tr');

		for (const row of rows.toArray()) {
			const $row = $(row);
			const header = $row.find('th').text().toLowerCase();

			if (header.includes("palme d'or")) {
				const valueCell = $row.find('td');
				const titleElement = valueCell.find('i').first();
				const linkElement = valueCell.find('a').first();

				let title = '';
				let referenceUrl: string | undefined;

				if (titleElement.length > 0) {
					title = titleElement.text().trim();
				} else if (linkElement.length > 0) {
					title = linkElement.text().trim();
					const href = linkElement.attr('href');
					if (href) {
						referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
					}
				}

				if (title) {
					return {
						title: cleanupTitle(title),
						year,
						isWinner: true,
						referenceUrl,
					};
				}
			}
		}
	}

	// Infoboxで見つからない場合、Awardsセクションを探す
	const headings = $('h2, h3, h4');

	for (const heading of headings.toArray()) {
		const $heading = $(heading);
		const text = $heading.text().toLowerCase();

		if (text.includes('award') || text.includes('prize')) {
			// Awards セクションの後のコンテンツを探す
			let nextElement = $heading.parent().next();
			let attempts = 0;

			while (nextElement.length > 0 && attempts < 10) {
				// リスト形式の受賞作品を探す
				const listItems = nextElement.find('li');

				for (const item of listItems.toArray()) {
					const $item = $(item);
					const itemText = $item.text().toLowerCase();

					if (
						itemText.includes("palme d'or") ||
						itemText.includes("palm d'or")
					) {
						// Palme d'Or を見つけた場合、映画タイトルを抽出
						const titleElement = $item.find('i').first();
						const linkElement = $item.find('a').first();

						let title = '';
						let referenceUrl: string | undefined;

						if (titleElement.length > 0) {
							title = titleElement.text().trim();
						} else if (linkElement.length > 0) {
							// リンクテキストがPalme d'Orではなく映画タイトルかチェック
							const linkText = linkElement.text().trim();
							if (
								!linkText.toLowerCase().includes('palme') &&
								!linkText.toLowerCase().includes('palm')
							) {
								title = linkText;
								const href = linkElement.attr('href');
								if (href) {
									referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
								}
							}
						}

						if (!title) {
							// タイトルを抽出するために、テキストをパース
							const fullText = $item.text();
							// "Palme d'Or:" の後または映画タイトルを示すパターンを探す
							const patterns = [
								/palme d'or[:\s-]+([^,\n(]+)/i,
								/palm d'or[:\s-]+([^,\n(]+)/i,
								/golden palm[:\s-]+([^,\n(]+)/i,
							];

							for (const pattern of patterns) {
								const match = fullText.match(pattern);
								if (match) {
									title = match[1].trim();
									break;
								}
							}
						}

						if (title) {
							return {
								title: cleanupTitle(title),
								year,
								isWinner: true,
								referenceUrl,
							};
						}
					}
				}

				// テーブル形式の受賞作品も探す
				const tables = nextElement.find('table');
				for (const table of tables.toArray()) {
					const $table = $(table);
					const rows = $table.find('tr');

					for (const row of rows.toArray()) {
						const $row = $(row);
						const rowText = $row.text().toLowerCase();

						if (
							rowText.includes("palme d'or") ||
							rowText.includes("palm d'or")
						) {
							const cells = $row.find('td');
							if (cells.length > 1) {
								// 2番目のセルに映画タイトルがある場合が多い
								const titleCell = cells.eq(1);
								const titleElement = titleCell.find('i').first();
								const linkElement = titleCell.find('a').first();

								let title = '';
								let referenceUrl: string | undefined;

								if (titleElement.length > 0) {
									title = titleElement.text().trim();
								} else if (linkElement.length > 0) {
									title = linkElement.text().trim();
									const href = linkElement.attr('href');
									if (href) {
										referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
									}
								} else {
									title = titleCell.text().trim();
								}

								if (title) {
									return {
										title: cleanupTitle(title),
										year,
										isWinner: true,
										referenceUrl,
									};
								}
							}
						}
					}
				}

				if (nextElement.is('h2, h3, h4')) {
					break;
				}

				nextElement = nextElement.next();
				attempts++;
			}
		}
	}

	return undefined;
}

export async function updateAllCannesWinnersOnly() {
	try {
		await fetchMasterData();

		const currentYear = new Date().getFullYear();
		for (let year = currentYear; year >= 1946; year--) {
			console.log(`\nUpdating Cannes winners for ${year}...`);

			try {
				await updateCannesWinnersOnly(year);
			} catch (error) {
				console.error(`Error updating winners for year ${year}:`, error);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		console.log('Cannes winners update completed successfully');
	} catch (error) {
		console.error('Error updating Cannes winners:', error);
		throw error;
	}
}

export async function updateCannesWinnersOnly(year: number) {
	try {
		const master = await fetchMasterData();

		console.log(`Processing Cannes ${year} winners...`);

		const winner = await fetchPalmeDOrWinner(year);

		if (winner) {
			await updateWinnerStatus(
				winner,
				await getOrCreateCeremony(year, master.organizationUid),
				master,
			);
			console.log(`Updated winner for ${year}: ${winner.title}`);
		} else {
			console.log(`No Palme d'Or winner found for ${year}`);
		}

		console.log(`Cannes ${year} winner update completed`);
	} catch (error) {
		console.error(`Error updating Cannes ${year} winners:`, error);
		throw error;
	}
}

async function fetchPalmeDOrWinner(
	year: number,
): Promise<MovieInfo | undefined> {
	const yearUrl = `${WIKIPEDIA_BASE_URL}/wiki/${year}_Cannes_Film_Festival`;

	console.log(`Fetching ${yearUrl}...`);
	const response = await fetch(yearUrl);

	if (!response.ok) {
		console.log(`Page not found for ${year}, skipping...`);
		return undefined;
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	return findPalmeDOrWinner($, year);
}

async function updateWinnerStatus(
	movieInfo: MovieInfo,
	ceremonyUid: string,
	master: MasterData,
) {
	try {
		const database = getDatabase(environment_);

		// 既存の映画を検索
		const existingMovies = await database
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
					eq(translations.languageCode, 'en'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(translations.content, movieInfo.title));

		if (existingMovies.length === 0) {
			console.log(`Movie not found in database: ${movieInfo.title}`);
			return;
		}

		const movieUid = existingMovies[0].movies.uid;

		// ノミネーション情報を更新
		await database
			.update(nominations)
			.set({
				isWinner: 1,
				updatedAt: Math.floor(Date.now() / 1000),
			})
			.where(
				and(
					eq(nominations.movieUid, movieUid),
					eq(nominations.ceremonyUid, ceremonyUid),
					eq(nominations.categoryUid, master.palmeDOrCategoryUid),
				),
			);

		console.log(
			`Updated winner status for ${movieInfo.title} (${movieInfo.year})`,
		);
	} catch (error) {
		console.error(
			`Error updating winner status for ${movieInfo.title}:`,
			error,
		);
		throw error;
	}
}

function cleanupTitle(title: string): string {
	return title
		.replaceAll(/\s*\([^)]*\)/g, '')
		.replaceAll(/\s*\[[^\]]*]/g, '')
		.replaceAll('*', '')
		.trim();
}

// TMDb APIのレスポンス型
type TMDatabaseSearchResponse = {
	results: Array<{
		id: number;
		title: string;
		original_title: string;
		release_date: string;
	}>;
};

type TMDatabaseMovieDetails = {
	imdb_id: string;
	title: string;
	original_title: string;
	release_date: string;
	poster_path?: string;
};

type TMDatabaseConfiguration = {
	images: {
		base_url: string;
		secure_base_url: string;
		poster_sizes: string[];
	};
};

async function fetchTMDatabaseConfiguration(): Promise<
	TMDatabaseConfiguration | undefined
> {
	if (!TMDB_API_KEY) {
		console.error('TMDb API key is not set');
		return undefined;
	}

	if (tmdbConfiguration) {
		return tmdbConfiguration;
	}

	try {
		const configUrl = new URL(`${TMDB_API_BASE_URL}/configuration`);
		configUrl.searchParams.append('api_key', TMDB_API_KEY);

		const response = await fetch(configUrl.toString());
		if (!response.ok) {
			throw new Error(`TMDb API error: ${response.statusText}`);
		}

		tmdbConfiguration = (await response.json()) as TMDatabaseConfiguration;
		return tmdbConfiguration;
	} catch (error) {
		console.error('Error fetching TMDb configuration:', error);
		return undefined;
	}
}

async function searchTMDatabaseMovie(
	title: string,
	year: number,
): Promise<number | undefined> {
	if (!TMDB_API_KEY) {
		console.error('TMDb API key is not set');
		return undefined;
	}

	try {
		const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
		searchUrl.searchParams.append('api_key', TMDB_API_KEY);
		searchUrl.searchParams.append('query', title);
		searchUrl.searchParams.append('year', year.toString());
		searchUrl.searchParams.append('language', 'en-US');

		const response = await fetch(searchUrl.toString());
		if (!response.ok) {
			throw new Error(`TMDb API error: ${response.statusText}`);
		}

		const data = (await response.json()) as TMDatabaseSearchResponse;

		// 結果をフィルタリング
		const matches = data.results.filter((movie) => {
			const movieYear = new Date(movie.release_date).getFullYear();
			return Math.abs(movieYear - year) <= 1; // 1年の誤差を許容
		});

		// 最も関連性の高い結果を返す
		return matches.length > 0 ? matches[0].id : undefined;
	} catch (error) {
		console.error(`Error searching TMDb for ${title} (${year}):`, error);
		return undefined;
	}
}

type MovieDetailsResult = {
	imdbId?: string;
	posterPath?: string;
	japaneseTitle?: string;
};

async function fetchTMDatabaseMovieDetails(
	movieId: number,
): Promise<MovieDetailsResult> {
	if (!TMDB_API_KEY) {
		console.error('TMDb API key is not set');
		return {};
	}

	try {
		// 英語版の詳細情報を取得
		const detailsUrlEn = new URL(`${TMDB_API_BASE_URL}/movie/${movieId}`);
		detailsUrlEn.searchParams.append('api_key', TMDB_API_KEY);
		detailsUrlEn.searchParams.append('language', 'en-US');

		const responseEn = await fetch(detailsUrlEn.toString());
		if (!responseEn.ok) {
			throw new Error(`TMDb API error: ${responseEn.statusText}`);
		}

		const dataEn = (await responseEn.json()) as TMDatabaseMovieDetails;

		// 日本語版の詳細情報を取得
		const detailsUrlJa = new URL(`${TMDB_API_BASE_URL}/movie/${movieId}`);
		detailsUrlJa.searchParams.append('api_key', TMDB_API_KEY);
		detailsUrlJa.searchParams.append('language', 'ja');

		const responseJa = await fetch(detailsUrlJa.toString());
		if (!responseJa.ok) {
			throw new Error(`TMDb API error: ${responseJa.statusText}`);
		}

		const dataJa = (await responseJa.json()) as TMDatabaseMovieDetails;

		// 日本語タイトルが英語タイトルと異なる場合のみ保存
		const japaneseTitle =
			dataJa.title && dataJa.title !== dataJa.original_title
				? dataJa.title
				: undefined;

		return {
			imdbId: dataEn.imdb_id || undefined,
			posterPath: dataEn.poster_path || undefined,
			japaneseTitle,
		};
	} catch (error) {
		console.error(
			`Error fetching TMDb movie details for ID ${movieId}:`,
			error,
		);
		return {};
	}
}

async function fetchMovieDetails(
	title: string,
	year: number,
): Promise<MovieDetailsResult> {
	try {
		// TMDbで映画を検索
		const movieId = await searchTMDatabaseMovie(title, year);
		if (!movieId) {
			console.log(`No TMDb match found for ${title} (${year})`);
			return {};
		}

		// 映画の詳細情報を取得
		const details = await fetchTMDatabaseMovieDetails(movieId);
		if (details.imdbId) {
			console.log(`Found IMDb ID for ${title} (${year}): ${details.imdbId}`);
		}

		if (details.japaneseTitle) {
			console.log(
				`Found Japanese title for ${title} (${year}): ${details.japaneseTitle}`,
			);
		}

		if (details.posterPath) {
			console.log(`Found poster for ${title} (${year}): ${details.posterPath}`);
		}

		return details;
	} catch (error) {
		console.error(
			`Error fetching movie details for ${title} (${year}):`,
			error,
		);
		return {};
	}
}

async function processMovieForBatch(
	movieInfo: MovieInfo,
	ceremonyUid: string,
	master: MasterData,
): Promise<
	| {
			translations: Array<typeof translations.$inferInsert>;
			posterUrls: Array<typeof posterUrls.$inferInsert>;
			referenceUrl?: typeof referenceUrls.$inferInsert;
			nomination?: typeof nominations.$inferInsert;
	  }
	| undefined
> {
	try {
		const database = getDatabase(environment_);
		// 映画の詳細情報を取得
		const movieDetails = await fetchMovieDetails(
			movieInfo.title,
			movieInfo.year,
		);
		// 既存の映画を検索
		const existingMovies = await database
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
					eq(translations.languageCode, 'en'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(translations.content, movieInfo.title));

		let movieUid: string;
		const translationsBatch: Array<typeof translations.$inferInsert> = [];
		const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];

		if (existingMovies.length > 0) {
			// 既存の映画が見つかった場合は更新
			const existingMovie = existingMovies[0].movies;
			movieUid = existingMovie.uid;
			// IMDb IDが新しく取得できた場合は更新（差分チェック付き）
			if (movieDetails.imdbId && !existingMovie.imdbId) {
				await database
					.update(movies)
					.set({
						imdbId: movieDetails.imdbId,
						updatedAt: Math.floor(Date.now() / 1000),
					})
					.where(eq(movies.uid, movieUid));
				console.log(
					`Updated IMDb ID for ${movieInfo.title}: ${movieDetails.imdbId}`,
				);
			}
		} else {
			// 新規映画の作成
			const [newMovie] = await database
				.insert(movies)
				.values({
					originalLanguage: 'en',
					year: movieInfo.year,
					imdbId: movieDetails.imdbId || undefined,
				})
				.returning();
			if (!newMovie) {
				throw new Error(`Failed to create movie: ${movieInfo.title}`);
			}

			movieUid = newMovie.uid;
			// 英語タイトルをバッチに追加
			translationsBatch.push({
				resourceType: 'movie_title',
				resourceUid: movieUid,
				languageCode: 'en',
				content: movieInfo.title,
				isDefault: 1,
			});
		}

		// 日本語タイトルがある場合はバッチに追加
		if (movieDetails.japaneseTitle) {
			translationsBatch.push({
				resourceType: 'movie_title',
				resourceUid: movieUid,
				languageCode: 'ja',
				content: movieDetails.japaneseTitle,
				isDefault: 0,
			});
		}

		// ポスターURLがある場合はバッチに追加（w342のみに削減）
		if (movieDetails.posterPath) {
			const config = await fetchTMDatabaseConfiguration();
			if (config) {
				const size = 'w342';
				if (config.images.poster_sizes.includes(size)) {
					const posterUrl = `${config.images.secure_base_url}${size}${movieDetails.posterPath}`;
					const width = Number.parseInt(size.slice(1), 10);
					posterUrlsBatch.push({
						movieUid,
						url: posterUrl,
						width,
						sourceType: 'tmdb',
						isPrimary: 1,
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
				languageCode: 'en',
				isPrimary: 1,
			};
		}

		// ノミネーション
		const categoryUid = movieInfo.isWinner
			? master.palmeDOrCategoryUid
			: master.palmeDOrCategoryUid; // コンペティション参加作品もPalme d'Orカテゴリーに登録
		const nominationData: typeof nominations.$inferInsert = {
			movieUid,
			ceremonyUid,
			categoryUid,
			isWinner: movieInfo.isWinner ? 1 : 0,
		};

		console.log(
			`Processed ${existingMovies.length > 0 ? 'updated' : 'new'} movie: ${
				movieInfo.title
			} (${movieInfo.year}) - ${
				movieInfo.isWinner ? "Palme d'Or Winner" : 'In Competition'
			} ${movieDetails.imdbId ? `IMDb: ${movieDetails.imdbId}` : ''} ${
				movieDetails.japaneseTitle ? `JA: ${movieDetails.japaneseTitle}` : ''
			} ${movieDetails.posterPath ? 'Poster: ✓' : ''}`,
		);

		return {
			translations: translationsBatch,
			posterUrls: posterUrlsBatch,
			referenceUrl: referenceUrlData,
			nomination: nominationData,
		};
	} catch (error) {
		console.error(`Error processing movie ${movieInfo.title}:`, error);
		return undefined;
	}
}

async function processMovie(
	movieInfo: MovieInfo,
	ceremonyUid: string,
	master: MasterData,
) {
	try {
		const database = getDatabase(environment_);

		// 映画の詳細情報を取得
		const movieDetails = await fetchMovieDetails(
			movieInfo.title,
			movieInfo.year,
		);

		// 既存の映画を検索
		const existingMovies = await database
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
					eq(translations.languageCode, 'en'),
					eq(translations.isDefault, 1),
				),
			)
			.where(eq(translations.content, movieInfo.title));

		let movieUid: string;

		if (existingMovies.length > 0) {
			// 既存の映画が見つかった場合は更新
			const existingMovie = existingMovies[0].movies;
			movieUid = existingMovie.uid;

			// IMDb IDが新しく取得できた場合は更新
			if (movieDetails.imdbId && !existingMovie.imdbId) {
				await database
					.update(movies)
					.set({
						imdbId: movieDetails.imdbId,
						updatedAt: Math.floor(Date.now() / 1000),
					})
					.where(eq(movies.uid, movieUid));
				console.log(
					`Updated IMDb ID for ${movieInfo.title}: ${movieDetails.imdbId}`,
				);
			}
		} else {
			// 新規映画の作成
			const [newMovie] = await database
				.insert(movies)
				.values({
					originalLanguage: 'en',
					year: movieInfo.year,
					imdbId: movieDetails.imdbId || undefined,
				})
				.returning();

			if (!newMovie) {
				throw new Error(`Failed to create movie: ${movieInfo.title}`);
			}

			movieUid = newMovie.uid;

			await database.insert(translations).values({
				resourceType: 'movie_title',
				resourceUid: movieUid,
				languageCode: 'en',
				content: movieInfo.title,
				isDefault: 1,
			});
		}

		// 参照URLの追加（重複の場合は無視）
		if (movieInfo.referenceUrl) {
			await database
				.insert(referenceUrls)
				.values({
					movieUid,
					url: movieInfo.referenceUrl,
					sourceType: 'wikipedia',
					languageCode: 'en',
					isPrimary: 1,
				})
				.onConflictDoNothing();
		}

		// ノミネーション情報の更新または追加
		const categoryUid = movieInfo.isWinner
			? master.palmeDOrCategoryUid
			: master.palmeDOrCategoryUid; // コンペティション参加作品もPalme d'Orカテゴリーに登録

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

		// 日本語タイトルの保存
		if (movieDetails.japaneseTitle) {
			await database
				.insert(translations)
				.values({
					resourceType: 'movie_title',
					resourceUid: movieUid,
					languageCode: 'ja',
					content: movieDetails.japaneseTitle,
					isDefault: 0,
				})
				.onConflictDoUpdate({
					target: [
						translations.resourceType,
						translations.resourceUid,
						translations.languageCode,
					],
					set: {
						content: movieDetails.japaneseTitle,
						updatedAt: Math.floor(Date.now() / 1000),
					},
				});
		}

		// ポスターURLの保存
		if (movieDetails.posterPath) {
			const config = await fetchTMDatabaseConfiguration();
			if (config) {
				// 複数のサイズを保存（w342とw780）
				const posterSizes = ['w342', 'w780'];
				for (const size of posterSizes) {
					if (config.images.poster_sizes.includes(size)) {
						const posterUrl = `${config.images.secure_base_url}${size}${movieDetails.posterPath}`;
						const width = Number.parseInt(size.slice(1), 10);

						await database
							.insert(posterUrls)
							.values({
								movieUid,
								url: posterUrl,
								width,
								sourceType: 'tmdb',
								isPrimary: size === 'w342' ? 1 : 0,
							})
							.onConflictDoNothing();
					}
				}
			}
		}

		console.log(
			`Processed ${existingMovies.length > 0 ? 'updated' : 'new'} movie: ${
				movieInfo.title
			} (${movieInfo.year}) - ${
				movieInfo.isWinner ? "Palme d'Or Winner" : 'In Competition'
			} ${movieDetails.imdbId ? `IMDb: ${movieDetails.imdbId}` : ''} ${
				movieDetails.japaneseTitle ? `JA: ${movieDetails.japaneseTitle}` : ''
			} ${movieDetails.posterPath ? 'Poster: ✓' : ''}`,
		);
	} catch (error) {
		console.error(`Error processing movie ${movieInfo.title}:`, error);
		throw error;
	}
}
