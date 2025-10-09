import * as cheerio from 'cheerio';
import {type Element} from 'domhandler';
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

type MainData = {
	organizationUid: string;
	palmeDOrCategoryUid: string;
	grandPrixCategoryUid: string;
	ceremonies: Map<number, string>;
};

let mainData: MainData | undefined;
let environment_: Environment;
let TMDB_API_KEY: string | undefined;
let tmdbConfiguration: TMDatabaseConfiguration | undefined;
let isDryRun = false;

export default {
	async fetch(request: Request, environment: Environment): Promise<Response> {
		environment_ = environment;
		TMDB_API_KEY = environment.TMDB_API_KEY;

		const url = new URL(request.url);
		const yearParameter = url.searchParams.get('year');
		const winnersOnlyParameter = url.searchParams.get('winners-only');
		const dryRunParameter = url.searchParams.get('dry-run');
		isDryRun = dryRunParameter === 'true';

		try {
			if (isDryRun) {
				console.log(
					'[DRY RUN MODE] No actual database operations will be performed',
				);
			}

			if (winnersOnlyParameter === 'true') {
				// 受賞作品のみ更新
				if (yearParameter) {
					const targetYear = Number.parseInt(yearParameter, 10);
					await updateCannesWinnersOnly(targetYear);
				} else {
					await updateAllCannesWinnersOnly();
				}
			} else if (yearParameter) {
				// 通常のスクレイピング
				const targetYear = Number.parseInt(yearParameter, 10);
				await scrapeCannesFilmFestivalYear(targetYear);
			} else {
				await scrapeCannesFilmFestival();
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

async function fetchMainData(): Promise<MainData> {
	if (mainData) return mainData;

	if (isDryRun) {
		// Dry run mode - return mock data
		mainData = {
			organizationUid: 'mock-cannes-uid',
			palmeDOrCategoryUid: 'mock-palme-dor-uid',
			grandPrixCategoryUid: 'mock-grand-prix-uid',
			ceremonies: new Map(),
		};
		return mainData;
	}

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

	mainData = {
		organizationUid: organization.uid,
		palmeDOrCategoryUid: palmeDOr.uid,
		grandPrixCategoryUid: grandPrix.uid,
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

	mainData?.ceremonies.set(year, ceremony.uid);

	return ceremony.uid;
}

type YearBatchData = {
	translations: Array<typeof translations.$inferInsert>;
	posterUrls: Array<typeof posterUrls.$inferInsert>;
	referenceUrls: Array<typeof referenceUrls.$inferInsert>;
	nominations: Array<typeof nominations.$inferInsert>;
	movieCount: number;
};

async function processCannesYear(year: number, main: MainData) {
	console.log(`\nProcessing Cannes ${year}...`);

	try {
		const batches = await gatherYearBatches(year, main);
		await persistYearBatches(year, batches);
		console.log(`Processed ${batches.movieCount} movies for ${year}`);
	} catch (error) {
		console.error(`Error processing year ${year}:`, error);
	}

	await delay(1000);
}

async function gatherYearBatches(
	year: number,
	main: MainData,
): Promise<YearBatchData> {
	const movies = await scrapeYearPage(year);
	const ceremonyUid = await getOrCreateCeremony(year, main.organizationUid);
	const batches: YearBatchData = {
		translations: [],
		posterUrls: [],
		referenceUrls: [],
		nominations: [],
		movieCount: movies.length,
	};

	for (const movie of movies) {
		const batchData = await processMovieForBatch(movie, ceremonyUid, main);
		if (!batchData) {
			continue;
		}

		batches.translations.push(...batchData.translations);
		batches.posterUrls.push(...batchData.posterUrls);

		if (batchData.referenceUrl) {
			batches.referenceUrls.push(batchData.referenceUrl);
		}

		if (batchData.nomination) {
			batches.nominations.push(batchData.nomination);
		}
	}

	return batches;
}

async function persistYearBatches(year: number, batches: YearBatchData) {
	if (isDryRun) {
		console.log(`\n[DRY RUN] Would insert for ${year}:`);
		console.log(`  - ${batches.translations.length} translations`);
		console.log(`  - ${batches.posterUrls.length} poster URLs`);
		console.log(`  - ${batches.referenceUrls.length} reference URLs`);
		console.log(`  - ${batches.nominations.length} nominations`);
		return;
	}

	const database = getDatabase(environment_);

	if (batches.translations.length > 0) {
		console.log(
			`Inserting ${batches.translations.length} translations in batch...`,
		);
		await database
			.insert(translations)
			.values(batches.translations)
			.onConflictDoNothing();
	}

	if (batches.posterUrls.length > 0) {
		console.log(
			`Inserting ${batches.posterUrls.length} poster URLs in batch...`,
		);
		await database
			.insert(posterUrls)
			.values(batches.posterUrls)
			.onConflictDoNothing();
	}

	if (batches.referenceUrls.length > 0) {
		console.log(
			`Inserting ${batches.referenceUrls.length} reference URLs in batch...`,
		);
		await database
			.insert(referenceUrls)
			.values(batches.referenceUrls)
			.onConflictDoNothing();
	}

	if (batches.nominations.length > 0) {
		console.log(
			`Inserting ${batches.nominations.length} nominations in batch...`,
		);
		await database
			.insert(nominations)
			.values(batches.nominations)
			.onConflictDoNothing();
	}
}

async function delay(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function scrapeCannesFilmFestival() {
	try {
		const main = await fetchMainData();
		const currentYear = new Date().getFullYear();

		for (let year = currentYear; year >= 1946; year--) {
			await processCannesYear(year, main);
		}

		console.log('Cannes Film Festival scraping completed successfully');
	} catch (error) {
		console.error('Error scraping Cannes Film Festival:', error);
		throw error;
	}
}

export async function scrapeCannesFilmFestivalYear(year: number) {
	try {
		const main = await fetchMainData();

		console.log(`Processing Cannes ${year}...`);

		const movies = await scrapeYearPage(year);
		const ceremonyUid = await getOrCreateCeremony(year, main.organizationUid);

		// バッチ処理のためのデータを収集
		const translationsBatch: Array<typeof translations.$inferInsert> = [];
		const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];
		const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
		const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

		for (const movie of movies) {
			const batchData = await processMovieForBatch(movie, ceremonyUid, main);
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
		if (isDryRun) {
			console.log(`\n[DRY RUN] Would insert for year ${year}:`);
			console.log(`  - ${translationsBatch.length} translations`);
			console.log(`  - ${posterUrlsBatch.length} poster URLs`);
			console.log(`  - ${referenceUrlsBatch.length} reference URLs`);
			console.log(`  - ${nominationsBatch.length} nominations`);
		} else {
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

type FilmTableMatch = {
	table: cheerio.Cheerio<Element>;
	source: 'self' | 'child';
};

function extractHeaderTexts(
	$: cheerio.CheerioAPI,
	table: cheerio.Cheerio<Element>,
): string[] {
	return table
		.find('tr')
		.first()
		.find('th')
		.map((_, element) => $(element).text().toLowerCase())
		.get();
}

function hasFilmHeaders(headerTexts: string[]): boolean {
	return headerTexts.some(
		(header) =>
			header.includes('title') ||
			header.includes('film') ||
			header.includes('director'),
	);
}

function hasPersonHeaders(headerTexts: string[]): boolean {
	return headerTexts.some(
		(header) =>
			header.includes('jury') ||
			header.includes('member') ||
			header.includes('president'),
	);
}

function locateFilmTable(
	$: cheerio.CheerioAPI,
	element: cheerio.Cheerio<Element>,
): FilmTableMatch | undefined {
	if (element.is('table')) {
		const headers = extractHeaderTexts($, element);
		if (hasFilmHeaders(headers) && !hasPersonHeaders(headers)) {
			return {table: element, source: 'self'};
		}
	}

	const childTable = element.find('table').first();
	if (childTable.length > 0) {
		const headers = extractHeaderTexts($, childTable);
		if (hasFilmHeaders(headers) && !hasPersonHeaders(headers)) {
			return {table: childTable, source: 'child'};
		}
	}

	return undefined;
}

function isPotentialFilmsHeading(text: string): boolean {
	const lower = text.toLowerCase();
	return lower.includes('film') || lower.includes('official selection');
}

function findCompetitionSection(
	$: cheerio.CheerioAPI,
): cheerio.Cheerio<Element> | undefined {
	const tables = $('table.wikitable');
	console.log(`Found ${tables.length} wikitable(s)`);

	for (const [index, tableElement] of tables.toArray().entries()) {
		const table = $(tableElement);
		const headerTexts = extractHeaderTexts($, table);

		console.log(`Table ${index} headers: ${headerTexts.join(' | ')}`);

		if (hasFilmHeaders(headerTexts) && !hasPersonHeaders(headerTexts)) {
			console.log(`Found films table at index ${index}`);
			return table;
		}
	}

	const headings = $('h2, h3, h4');

	for (const heading of headings.toArray()) {
		const $heading = $(heading);
		const text = $heading.text();

		if (!isPotentialFilmsHeading(text)) {
			continue;
		}

		console.log(`Found potential films heading: "${text}"`);

		let nextElement = $heading.parent().next();
		let attempts = 0;

		while (nextElement.length > 0 && attempts < 15) {
			const filmTableMatch = locateFilmTable($, nextElement);
			if (filmTableMatch) {
				const message =
					filmTableMatch.source === 'self'
						? 'Found films table after heading'
						: 'Found films table inside element';
				console.log(message);
				return filmTableMatch.table;
			}

			if (nextElement.is('h2, h3, h4')) {
				console.log('Reached next heading, stopping search');
				break;
			}

			nextElement = nextElement.next();
			attempts++;
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

type WinnerCandidate = {
	title: string;
	referenceUrl?: string;
};

const PALME_KEYWORDS = ["palme d'or", "palm d'or", 'golden palm'];

function containsPalmeKeyword(text: string): boolean {
	const lower = text.toLowerCase();
	return PALME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

const TITLE_PATTERNS = [
	/palme d'or[:\s-]+([^,\n(]+)/i,
	/palm d'or[:\s-]+([^,\n(]+)/i,
	/golden palm[:\s-]+([^,\n(]+)/i,
];

function extractWinnerFromText(text: string): string | undefined {
	for (const pattern of TITLE_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			return match[1].trim();
		}
	}

	return undefined;
}

function extractWinnerFromElement(
	$: cheerio.CheerioAPI,
	scope: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
	const italicElement = scope.find('i').first();
	if (italicElement.length > 0) {
		const title = italicElement.text().trim();
		if (title) {
			return {title};
		}
	}

	const linkElement = scope.find('a').first();
	if (linkElement.length > 0) {
		const linkText = linkElement.text().trim();
		if (linkText && !containsPalmeKeyword(linkText)) {
			const href = linkElement.attr('href');
			return {
				title: linkText,
				referenceUrl: href ? `${WIKIPEDIA_BASE_URL}${href}` : undefined,
			};
		}
	}

	const fullText = scope.text().trim();
	const extractedTitle = extractWinnerFromText(fullText);
	if (extractedTitle) {
		return {title: extractedTitle};
	}

	return undefined;
}

function buildWinner(candidate: WinnerCandidate, year: number): MovieInfo {
	return {
		title: cleanupTitle(candidate.title),
		year,
		isWinner: true,
		referenceUrl: candidate.referenceUrl,
	};
}

function findWinnerInInfobox(
	$: cheerio.CheerioAPI,
): WinnerCandidate | undefined {
	const infoBox = $('.infobox');
	if (infoBox.length === 0) {
		return undefined;
	}

	for (const row of infoBox.find('tr').toArray()) {
		const $row = $(row);
		const header = $row.find('th').text();
		if (!containsPalmeKeyword(header)) {
			continue;
		}

		const valueCell = $row.find('td').first();
		if (valueCell.length === 0) {
			continue;
		}

		const candidate = extractWinnerFromElement($, valueCell);
		if (candidate) {
			return candidate;
		}
	}

	return undefined;
}

function findWinnerInAwardsSections(
	$: cheerio.CheerioAPI,
): WinnerCandidate | undefined {
	const headings = $('h2, h3, h4');

	for (const heading of headings.toArray()) {
		const $heading = $(heading);
		const text = $heading.text().toLowerCase();
		if (!text.includes('award') && !text.includes('prize')) {
			continue;
		}

		const candidate = searchAwardSection($, $heading);
		if (candidate) {
			return candidate;
		}
	}

	return undefined;
}

function searchAwardSection(
	$: cheerio.CheerioAPI,
	heading: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
	let nextElement = heading.parent().next();
	let attempts = 0;

	while (nextElement.length > 0 && attempts < 10) {
		const listWinner = findWinnerInLists($, nextElement);
		if (listWinner) {
			return listWinner;
		}

		const tableWinner = findWinnerInTables($, nextElement);
		if (tableWinner) {
			return tableWinner;
		}

		if (nextElement.is('h2, h3, h4')) {
			break;
		}

		nextElement = nextElement.next();
		attempts++;
	}

	return undefined;
}

function findWinnerInLists(
	$: cheerio.CheerioAPI,
	container: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
	const listItems = container.find('li');

	for (const item of listItems.toArray()) {
		const $item = $(item);
		if (!containsPalmeKeyword($item.text())) {
			continue;
		}

		const candidate = extractWinnerFromElement($, $item);
		if (candidate) {
			return candidate;
		}
	}

	return undefined;
}

function findWinnerInTables(
	$: cheerio.CheerioAPI,
	container: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
	const tables = container.find('table');

	for (const table of tables.toArray()) {
		const $table = $(table);
		const rows = $table.find('tr');

		for (const row of rows.toArray()) {
			const $row = $(row);
			if (!containsPalmeKeyword($row.text())) {
				continue;
			}

			const candidate = extractWinnerFromAwardRow($, $row);
			if (candidate) {
				return candidate;
			}
		}
	}

	return undefined;
}

function extractWinnerFromAwardRow(
	$: cheerio.CheerioAPI,
	row: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
	const cells = row.find('td');
	if (cells.length === 0) {
		return undefined;
	}

	const titleCell = cells.length > 1 ? cells.eq(1) : cells.first();
	return extractWinnerFromElement($, titleCell);
}

function findPalmeDOrWinner(
	$: cheerio.CheerioAPI,
	year: number,
): MovieInfo | undefined {
	const infoboxWinner = findWinnerInInfobox($);
	if (infoboxWinner) {
		return buildWinner(infoboxWinner, year);
	}

	const sectionWinner = findWinnerInAwardsSections($);
	if (sectionWinner) {
		return buildWinner(sectionWinner, year);
	}

	return undefined;
}

export async function updateAllCannesWinnersOnly() {
	try {
		await fetchMainData();

		const currentYear = new Date().getFullYear();
		for (let year = currentYear; year >= 1946; year--) {
			console.log(`\nUpdating Cannes winners for ${year}...`);

			try {
				await updateCannesWinnersOnly(year);
			} catch (error) {
				console.error(`Error updating winners for year ${year}:`, error);
			}

			await new Promise((resolve) => {
				setTimeout(resolve, 500);
			});
		}

		console.log('Cannes winners update completed successfully');
	} catch (error) {
		console.error('Error updating Cannes winners:', error);
		throw error;
	}
}

export async function updateCannesWinnersOnly(year: number) {
	try {
		const main = await fetchMainData();

		console.log(`Processing Cannes ${year} winners...`);

		const winner = await fetchPalmeDOrWinner(year);

		if (winner) {
			await updateWinnerStatus(
				winner,
				await getOrCreateCeremony(year, main.organizationUid),
				main,
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
	main: MainData,
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
					eq(nominations.categoryUid, main.palmeDOrCategoryUid),
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

		tmdbConfiguration = await response.json();
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

		const data: {
			results: Array<{
				id: number;
				title: string;
				release_date: string;
			}>;
		} = await response.json();

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

		const dataEn: {
			imdb_id?: string;
			poster_path?: string;
		} = await responseEn.json();

		// 日本語版の詳細情報を取得
		const detailsUrlJa = new URL(`${TMDB_API_BASE_URL}/movie/${movieId}`);
		detailsUrlJa.searchParams.append('api_key', TMDB_API_KEY);
		detailsUrlJa.searchParams.append('language', 'ja');

		const responseJa = await fetch(detailsUrlJa.toString());
		if (!responseJa.ok) {
			throw new Error(`TMDb API error: ${responseJa.statusText}`);
		}

		const dataJa: {
			title?: string;
			original_title?: string;
		} = await responseJa.json();

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

type DatabaseClient = ReturnType<typeof getDatabase>;

type MovieDetails = Awaited<ReturnType<typeof fetchMovieDetails>>;

async function resolveMovieUid(
	database: DatabaseClient,
	movieInfo: MovieInfo,
	movieDetails: MovieDetails,
): Promise<{
	movieUid: string;
	translations: Array<typeof translations.$inferInsert>;
	wasExisting: boolean;
}> {
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

	if (existingMovies.length > 0) {
		const existingMovie = existingMovies[0].movies;
		if (movieDetails.imdbId && !existingMovie.imdbId) {
			await database
				.update(movies)
				.set({
					imdbId: movieDetails.imdbId,
					updatedAt: Math.floor(Date.now() / 1000),
				})
				.where(eq(movies.uid, existingMovie.uid));
			console.log(
				`Updated IMDb ID for ${movieInfo.title}: ${movieDetails.imdbId}`,
			);
		}

		return {
			movieUid: existingMovie.uid,
			translations: [],
			wasExisting: true,
		};
	}

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

	const translationsBatch: Array<typeof translations.$inferInsert> = [
		{
			resourceType: 'movie_title',
			resourceUid: newMovie.uid,
			languageCode: 'en',
			content: movieInfo.title,
			isDefault: 1,
		},
	];

	return {
		movieUid: newMovie.uid,
		translations: translationsBatch,
		wasExisting: false,
	};
}

function appendJapaneseTitle(
	translationsBatch: Array<typeof translations.$inferInsert>,
	movieDetails: MovieDetails,
	movieUid: string,
) {
	if (!movieDetails.japaneseTitle) {
		return;
	}

	translationsBatch.push({
		resourceType: 'movie_title',
		resourceUid: movieUid,
		languageCode: 'ja',
		content: movieDetails.japaneseTitle,
		isDefault: 0,
	});
}

async function collectPosterUrls(
	movieDetails: MovieDetails,
	movieUid: string,
	sizes: string[] = ['w342'],
): Promise<Array<typeof posterUrls.$inferInsert>> {
	if (!movieDetails.posterPath) {
		return [];
	}

	const config = await fetchTMDatabaseConfiguration();
	if (!config) {
		return [];
	}

	const results: Array<typeof posterUrls.$inferInsert> = [];

	for (const [index, size] of sizes.entries()) {
		if (!config.images.poster_sizes.includes(size)) {
			continue;
		}

		const posterUrl = `${config.images.secure_base_url}${size}${movieDetails.posterPath}`;
		const width = Number.parseInt(size.slice(1), 10);

		results.push({
			movieUid,
			url: posterUrl,
			width,
			sourceType: 'tmdb',
			isPrimary: index === 0 ? 1 : 0,
		});
	}

	return results;
}

async function saveTranslations(
	database: DatabaseClient,
	translationsBatch: Array<typeof translations.$inferInsert>,
) {
	if (translationsBatch.length === 0) {
		return;
	}

	await database
		.insert(translations)
		.values(translationsBatch)
		.onConflictDoNothing();
}

async function upsertJapaneseTitleTranslation(
	database: DatabaseClient,
	movieUid: string,
	japaneseTitle: string,
) {
	await database
		.insert(translations)
		.values({
			resourceType: 'movie_title',
			resourceUid: movieUid,
			languageCode: 'ja',
			content: japaneseTitle,
			isDefault: 0,
		})
		.onConflictDoUpdate({
			target: [
				translations.resourceType,
				translations.resourceUid,
				translations.languageCode,
			],
			set: {
				content: japaneseTitle,
				updatedAt: Math.floor(Date.now() / 1000),
			},
		});
}

async function saveReferenceUrl(
	database: DatabaseClient,
	referenceUrlData: typeof referenceUrls.$inferInsert,
) {
	await database
		.insert(referenceUrls)
		.values(referenceUrlData)
		.onConflictDoNothing();
}

async function upsertNominationEntry(
	database: DatabaseClient,
	nominationData: typeof nominations.$inferInsert,
) {
	await database
		.insert(nominations)
		.values(nominationData)
		.onConflictDoUpdate({
			target: [
				nominations.movieUid,
				nominations.ceremonyUid,
				nominations.categoryUid,
			],
			set: {
				isWinner: nominationData.isWinner,
				updatedAt: Math.floor(Date.now() / 1000),
			},
		});
}

async function savePosterUrls(
	database: DatabaseClient,
	posterUrlsBatch: Array<typeof posterUrls.$inferInsert>,
) {
	if (posterUrlsBatch.length === 0) {
		return;
	}

	await database
		.insert(posterUrls)
		.values(posterUrlsBatch)
		.onConflictDoNothing();
}

function buildReferenceUrlData(
	movieInfo: MovieInfo,
	movieUid: string,
): typeof referenceUrls.$inferInsert | undefined {
	if (!movieInfo.referenceUrl) {
		return undefined;
	}

	return {
		movieUid,
		url: movieInfo.referenceUrl,
		sourceType: 'wikipedia',
		languageCode: 'en',
		isPrimary: 1,
	};
}

function buildNominationData(
	movieInfo: MovieInfo,
	movieUid: string,
	ceremonyUid: string,
	main: MainData,
): typeof nominations.$inferInsert {
	return {
		movieUid,
		ceremonyUid,
		categoryUid: main.palmeDOrCategoryUid,
		isWinner: movieInfo.isWinner ? 1 : 0,
	};
}

function logProcessedMovie(
	movieInfo: MovieInfo,
	movieDetails: MovieDetails,
	wasExisting: boolean,
) {
	const extras = [
		movieDetails.imdbId ? `IMDb: ${movieDetails.imdbId}` : '',
		movieDetails.japaneseTitle ? `JA: ${movieDetails.japaneseTitle}` : '',
		movieDetails.posterPath ? 'Poster: ✓' : '',
	].filter(Boolean);
	const postfix = extras.length > 0 ? ` ${extras.join(' ')}` : '';

	console.log(
		`Processed ${wasExisting ? 'updated' : 'new'} movie: ${movieInfo.title} (${movieInfo.year}) - ${
			movieInfo.isWinner ? "Palme d'Or Winner" : 'In Competition'
		}${postfix}`,
	);
}

async function processMovieForBatch(
	movieInfo: MovieInfo,
	ceremonyUid: string,
	main: MainData,
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
		if (isDryRun) {
			console.log(
				`[DRY RUN] Would process movie: ${movieInfo.title} (${movieInfo.year}) - ${
					movieInfo.isWinner ? 'Winner' : 'Nominee'
				}`,
			);
			return undefined;
		}

		const database = getDatabase(environment_);
		const movieDetails = await fetchMovieDetails(
			movieInfo.title,
			movieInfo.year,
		);
		const movieResolution = await resolveMovieUid(
			database,
			movieInfo,
			movieDetails,
		);
		const translationsBatch = [...movieResolution.translations];

		appendJapaneseTitle(
			translationsBatch,
			movieDetails,
			movieResolution.movieUid,
		);
		const posterUrlsBatch = await collectPosterUrls(
			movieDetails,
			movieResolution.movieUid,
		);
		const referenceUrlData = buildReferenceUrlData(
			movieInfo,
			movieResolution.movieUid,
		);
		const nominationData = buildNominationData(
			movieInfo,
			movieResolution.movieUid,
			ceremonyUid,
			main,
		);

		logProcessedMovie(movieInfo, movieDetails, movieResolution.wasExisting);

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
	main: MainData,
) {
	try {
		if (isDryRun) {
			console.log(
				`[DRY RUN] Would process movie: ${movieInfo.title} (${movieInfo.year}) - ${
					movieInfo.isWinner ? 'Winner' : 'Nominee'
				}`,
			);
			return;
		}

		const database = getDatabase(environment_);
		const movieDetails = await fetchMovieDetails(
			movieInfo.title,
			movieInfo.year,
		);
		const movieResolution = await resolveMovieUid(
			database,
			movieInfo,
			movieDetails,
		);

		await saveTranslations(database, movieResolution.translations);

		if (movieDetails.japaneseTitle) {
			await upsertJapaneseTitleTranslation(
				database,
				movieResolution.movieUid,
				movieDetails.japaneseTitle,
			);
		}

		const referenceUrlData = buildReferenceUrlData(
			movieInfo,
			movieResolution.movieUid,
		);
		if (referenceUrlData) {
			await saveReferenceUrl(database, referenceUrlData);
		}

		const nominationData = buildNominationData(
			movieInfo,
			movieResolution.movieUid,
			ceremonyUid,
			main,
		);
		await upsertNominationEntry(database, nominationData);

		const posterUrlsBatch = await collectPosterUrls(
			movieDetails,
			movieResolution.movieUid,
			['w342', 'w780'],
		);
		await savePosterUrls(database, posterUrlsBatch);

		logProcessedMovie(movieInfo, movieDetails, movieResolution.wasExisting);
	} catch (error) {
		console.error(`Error processing movie ${movieInfo.title}:`, error);
		throw error;
	}
}
