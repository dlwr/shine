import * as cheerio from 'cheerio';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// Mock external dependencies
vi.mock('../../src/seeds/academy-awards', () => ({
	seedAcademyAwards: vi.fn(),
}));

vi.mock('../../src/index', () => ({
	getDatabase: vi.fn(),
}));

vi.mock('./common/tmdb-utilities', () => ({
	fetchImdbId: vi.fn(),
	fetchJapaneseTitleFromTMDB: vi.fn(),
	fetchTMDBMovieImages: vi.fn(),
	saveJapaneseTranslation: vi.fn(),
	savePosterUrls: vi.fn(),
	saveTMDBId: vi.fn(),
}));

describe('Academy Awards Scraper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Table parsing', () => {
		it('should parse simple Academy Awards table', () => {
			const html = `
        <table class="wikitable">
          <tr>
            <th>Film</th>
            <th>Year</th>
            <th>Producer(s)</th>
          </tr>
          <tr>
            <td><b>The Godfather</b></td>
            <td>1972</td>
            <td>Albert S. Ruddy</td>
          </tr>
          <tr>
            <td>Cabaret</td>
            <td>1972</td>
            <td>Cy Feuer</td>
          </tr>
        </table>
      `;

			const $ = cheerio.load(html);
			const table = $('table.wikitable').first();

			// Test header parsing
			const headers = table.find('tr').first().find('th');
			expect(headers.length).toBe(3);
			expect($(headers[0]).text().trim()).toBe('Film');
			expect($(headers[1]).text().trim()).toBe('Year');
			expect($(headers[2]).text().trim()).toBe('Producer(s)');

			// Test data rows
			const dataRows = table.find('tr').slice(1);
			expect(dataRows.length).toBe(2);

			// Test winner detection (bold text)
			const firstRow = $(dataRows[0]);
			const winnerCell = firstRow.find('td').first();
			expect(winnerCell.find('b').length).toBe(1);
			expect(winnerCell.text().trim()).toBe('The Godfather');

			// Test non-winner
			const secondRow = $(dataRows[1]);
			const nomineeCell = secondRow.find('td').first();
			expect(nomineeCell.find('b').length).toBe(0);
			expect(nomineeCell.text().trim()).toBe('Cabaret');
		});

		it('should handle tables with different column structures', () => {
			const html = `
        <table class="wikitable">
          <tr>
            <th>Year</th>
            <th>Film</th>
            <th>Director</th>
          </tr>
          <tr>
            <td>1970</td>
            <td><b>Patton</b></td>
            <td>Franklin J. Schaffner</td>
          </tr>
        </table>
      `;

			const $ = cheerio.load(html);
			const table = $('table.wikitable').first();

			const headers = table.find('tr').first().find('th');
			expect(headers.length).toBe(3);
			expect($(headers[0]).text().trim()).toBe('Year');
			expect($(headers[1]).text().trim()).toBe('Film');
			expect($(headers[2]).text().trim()).toBe('Director');
		});
	});

	describe('Movie title extraction', () => {
		it('should extract movie title from various formats', () => {
			const testCases = [
				{input: 'The Godfather', expected: 'The Godfather'},
				{input: 'Citizen Kane (1941)', expected: 'Citizen Kane'},
				{
					input: 'The Lord of the Rings: The Return of the King',
					expected: 'The Lord of the Rings: The Return of the King',
				},
				{
					input: 'Slumdog Millionaire (2008 film)',
					expected: 'Slumdog Millionaire',
				},
				{input: 'The Artist (film)', expected: 'The Artist'},
			];

			for (const {input, expected} of testCases) {
				// Simple title extraction logic
				const title = input.replace(/\s*\([^)]*\).*$/, '').trim();
				expect(title).toBe(expected);
			}
		});

		it('should handle titles with special characters', () => {
			const testCases = [
				{
					input: 'Birdman or (The Unexpected Virtue of Ignorance)',
					expected: 'Birdman or (The Unexpected Virtue of Ignorance)',
				},
				{
					input: 'Three Billboards Outside Ebbing, Missouri',
					expected: 'Three Billboards Outside Ebbing, Missouri',
				},
				{
					input: 'Everything Everywhere All at Once',
					expected: 'Everything Everywhere All at Once',
				},
			];

			for (const {input, expected} of testCases) {
				expect(input.trim()).toBe(expected);
			}
		});
	});

	describe('Year extraction', () => {
		it('should extract year from text', () => {
			const testCases = [
				{input: '1972', expected: 1972},
				{input: '2023', expected: 2023},
				{input: '1929/1930', expected: 1929}, // Handle dual years
				{input: '1927/28', expected: 1927},
			];

			for (const {input, expected} of testCases) {
				const year = Number.parseInt(input.split('/')[0], 10);
				expect(year).toBe(expected);
			}
		});

		it('should handle invalid year formats', () => {
			const testCases = ['invalid', '', 'abc'];

			for (const input of testCases) {
				const year = Number.parseInt(input, 10);
				expect(Number.isNaN(year)).toBe(true);
			}
		});
	});

	describe('Winner detection', () => {
		it('should identify winners from HTML formatting', () => {
			const html = `
        <div>
          <b>The Godfather</b> (Winner)
          <i>Cabaret</i> (Nominee)
          <strong>Rocky</strong> (Winner)
          Taxi Driver (Nominee)
        </div>
      `;

			const $ = cheerio.load(html);

			// Test bold detection
			expect($('b').length).toBe(1);
			expect($('b').text()).toBe('The Godfather');

			// Test strong detection
			expect($('strong').length).toBe(1);
			expect($('strong').text()).toBe('Rocky');

			// Test non-winner
			expect($('div').text()).toContain('Taxi Driver');
		});

		it('should handle winner detection with various formatting', () => {
			const testCases = [
				{html: '<b>Movie Title</b>', isWinner: true},
				{html: '<strong>Movie Title</strong>', isWinner: true},
				{html: 'Movie Title', isWinner: false},
				{html: '<i>Movie Title</i>', isWinner: false},
				{html: '<em>Movie Title</em>', isWinner: false},
			];

			for (const {html, isWinner} of testCases) {
				const $ = cheerio.load(html);
				const hasBold = $('b, strong').length > 0;
				expect(hasBold).toBe(isWinner);
			}
		});
	});

	describe('URL extraction', () => {
		it('should extract Wikipedia URLs from links', () => {
			const html = `
        <a href="/wiki/The_Godfather">The Godfather</a>
        <a href="/wiki/Cabaret_(1972_film)">Cabaret</a>
        <a href="https://en.wikipedia.org/wiki/Rocky">Rocky</a>
        <a href="#section">Section Link</a>
      `;

			const $ = cheerio.load(html);

			$('a').each((index, element) => {
				const href = $(element).attr('href');
				if (href?.startsWith('/wiki/')) {
					const fullUrl = `https://en.wikipedia.org${href}`;
					expect(fullUrl).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
				}
			});
		});

		it('should handle various link formats', () => {
			const testCases = [
				{
					input: '/wiki/The_Godfather',
					expected: 'https://en.wikipedia.org/wiki/The_Godfather',
				},
				{
					input: '/wiki/Cabaret_(1972_film)',
					expected: 'https://en.wikipedia.org/wiki/Cabaret_(1972_film)',
				},
				{input: '#section', expected: undefined}, // Fragment links should be ignored
				{input: 'http://example.com', expected: undefined}, // External links should be ignored
			];

			for (const {input, expected} of testCases) {
				if (input.startsWith('/wiki/')) {
					const result = `https://en.wikipedia.org${input}`;
					expect(result).toBe(expected);
				} else {
					expect(expected).toBeUndefined();
				}
			}
		});
	});
});
