import * as cheerio from 'cheerio';
import {describe, expect, it} from 'vitest';
import {
  extractMainTitle,
  extractText,
  extractWikipediaJsonLD,
  normalizeText,
  parseHTML,
} from '../common/parser-utilities';

describe('Parser Utilities', () => {
  describe('parseHTML', () => {
    it('should parse HTML and return Cheerio instance', () => {
      const html = '<div><p>Test content</p></div>';
      const $ = parseHTML(html);

      expect($('p').text()).toBe('Test content');
      expect($('div').length).toBe(1);
    });

    it('should handle empty HTML', () => {
      const $ = parseHTML('');
      expect($.html()).toBe('<html><head></head><body></body></html>');
    });
  });

  describe('extractWikipediaJsonLD', () => {
    it('should extract JSON-LD data from Wikipedia page', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {"@context": "http://schema.org", "@type": "Movie", "name": "Test Movie"}
            </script>
          </head>
        </html>
      `;
      const $ = cheerio.load(html);
      const result = extractWikipediaJsonLD($);

      expect(result).toEqual({
        '@context': 'http://schema.org',
        '@type': 'Movie',
        name: 'Test Movie',
      });
    });

    it('should return undefined when no JSON-LD script exists', () => {
      const html = '<html><head></head></html>';
      const $ = cheerio.load(html);
      const result = extractWikipediaJsonLD($);

      expect(result).toBeUndefined();
    });

    it('should return undefined when JSON-LD is malformed', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {invalid json}
            </script>
          </head>
        </html>
      `;
      const $ = cheerio.load(html);
      const result = extractWikipediaJsonLD($);

      expect(result).toBeUndefined();
    });
  });

  describe('normalizeText', () => {
    it('should trim whitespace and normalize spaces', () => {
      const text = '  Test   text  with   multiple   spaces  ';
      const result = normalizeText(text);

      expect(result).toBe('Test text with multiple spaces');
    });

    it('should remove zero-width characters', () => {
      const text = 'Test\u200Btext\u200Cwith\u200Dzero\uFEFFwidth';
      const result = normalizeText(text);

      expect(result).toBe('Testtextwithzero width');
    });

    it('should handle empty string', () => {
      expect(normalizeText('')).toBe('');
    });

    it('should handle null/undefined input', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText('')).toBe('');
    });

    it('should handle newlines and tabs', () => {
      const text = 'Test\ntext\twith\r\nline\tbreaks';
      const result = normalizeText(text);

      expect(result).toBe('Test text with line breaks');
    });
  });

  describe('extractText', () => {
    it('should extract and normalize text from element', () => {
      const html = '<div><p>  Test  content  </p></div>';
      const $ = cheerio.load(html);
      const result = extractText($, 'p');

      expect(result).toBe('Test content');
    });

    it('should return empty string when element not found', () => {
      const html = '<div></div>';
      const $ = cheerio.load(html);
      const result = extractText($, 'p');

      expect(result).toBe('');
    });

    it('should handle nested elements', () => {
      const html = '<div><span>  Nested  </span><span>  content  </span></div>';
      const $ = cheerio.load(html);
      const result = extractText($, 'div');

      expect(result).toBe('Nested content');
    });
  });

  describe('extractMainTitle', () => {
    it('should extract main title from bracketed subtitle', () => {
      const title = '映画名 (サブタイトル)';
      const result = extractMainTitle(title);

      expect(result).toBe('映画名');
    });

    it('should extract main title from parenthetical description', () => {
      const title = 'Movie Title (2024年の映画)';
      const result = extractMainTitle(title);

      expect(result).toBe('Movie Title');
    });

    it('should handle titles without brackets', () => {
      const title = 'Simple Movie Title';
      const result = extractMainTitle(title);

      expect(result).toBe('Simple Movie Title');
    });

    it('should handle titles with multiple brackets', () => {
      const title = 'Movie Title (説明) (追加情報)';
      const result = extractMainTitle(title);

      expect(result).toBe('Movie Title');
    });

    it('should handle full-width parentheses', () => {
      const title = '映画タイトル（説明）';
      const result = extractMainTitle(title);

      expect(result).toBe('映画タイトル');
    });

    it('should normalize extracted title', () => {
      const title = '  Movie Title  (Description)  ';
      const result = extractMainTitle(title);

      expect(result).toBe('Movie Title');
    });

    it('should handle empty title', () => {
      expect(extractMainTitle('')).toBe('');
    });

    it('should handle title with only brackets', () => {
      const title = '(Description only)';
      const result = extractMainTitle(title);

      expect(result).toBe('(Description only)');
    });
  });
});
