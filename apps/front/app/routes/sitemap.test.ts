import {beforeEach, describe, expect, it, vi} from 'vitest';
import {loader as sitemapAwardsLoader} from './sitemap-awards';
import {loader as sitemapIndexLoader} from './sitemap-index';
import {loader as sitemapMoviesLoader} from './sitemap-movies';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const cast = <T>(value?: unknown): T => value as T;

const createIndexArguments = () =>
  cast<Parameters<typeof sitemapIndexLoader>[0]>({
    context: createMockContext(),
    request: new Request('https://shine-film.com/sitemap.xml'),
    params: {},
  });

const createMoviesArguments = (page: string) =>
  cast<Parameters<typeof sitemapMoviesLoader>[0]>({
    context: createMockContext(),
    request: new Request(
      `https://shine-film.com/sitemap/movies.xml?page=${page}`,
    ),
    params: {},
  });

const mockSearchResponse = (body: unknown, isOk = true) => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: isOk,
    json: async () => body,
  } as Response);
};

describe('sitemap.xml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('映画の総件数から必要な数の子sitemapを列挙する', async () => {
    mockSearchResponse({pagination: {totalCount: 250}});

    const response = await sitemapIndexLoader(createIndexArguments());
    const xml = await response.text();

    expect(xml).toContain(
      '<loc>https://shine-film.com/sitemap/movies.xml?page=1</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shine-film.com/sitemap/movies.xml?page=3</loc>',
    );
    expect(xml).not.toContain('page=4');
  });

  it('XMLのContent-Typeを返す', async () => {
    mockSearchResponse({pagination: {totalCount: 10}});

    const response = await sitemapIndexLoader(createIndexArguments());

    expect(response.headers.get('content-type')).toContain('application/xml');
  });

  it('賞のsitemapを列挙する', async () => {
    mockSearchResponse({pagination: {totalCount: 10}});

    const response = await sitemapIndexLoader(createIndexArguments());

    expect(await response.text()).toContain(
      '<loc>https://shine-film.com/sitemap/awards.xml</loc>',
    );
  });

  it('API取得に失敗しても200でsitemapindexを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await sitemapIndexLoader(createIndexArguments());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<sitemapindex');
  });
});

describe('sitemap/movies-:page.xml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('指定ページの映画詳細URLを列挙する', async () => {
    mockSearchResponse({
      movies: [{uid: 'movie-1'}, {uid: 'movie-2'}],
      pagination: {totalCount: 2},
    });

    const response = await sitemapMoviesLoader(createMoviesArguments('1'));
    const xml = await response.text();

    expect(xml).toContain('<loc>https://shine-film.com/movies/movie-1</loc>');
    expect(xml).toContain('<loc>https://shine-film.com/movies/movie-2</loc>');
  });

  it('指定されたページ番号でAPIを呼ぶ', async () => {
    mockSearchResponse({movies: [], pagination: {totalCount: 0}});

    await sitemapMoviesLoader(createMoviesArguments('3'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('page=3'),
      expect.anything(),
    );
  });

  it('ページ番号が数値でなければ404を返す', async () => {
    const response = await sitemapMoviesLoader(createMoviesArguments('abc'));

    expect(response.status).toBe(404);
  });

  it('API取得に失敗しても200で空のurlsetを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await sitemapMoviesLoader(createMoviesArguments('1'));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<urlset');
  });
});

const createAwardsArguments = () =>
  cast<Parameters<typeof sitemapAwardsLoader>[0]>({
    context: createMockContext(),
    request: new Request('https://shine-film.com/sitemap/awards.xml'),
    params: {},
  });

describe('sitemap/awards.xml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('賞一覧と各賞ページのURLを列挙する', async () => {
    mockSearchResponse({
      awards: [
        {slug: 'palme-dor', grouping: 'year'},
        {slug: 'academy-best-picture', grouping: 'year'},
        {slug: 'japan-academy-best-picture', grouping: 'year'},
      ],
    });
    mockSearchResponse({years: [{year: 2023}]});
    mockSearchResponse({years: [{year: 2023}]});
    mockSearchResponse({years: [{year: 2023}]});

    const response = await sitemapAwardsLoader(createAwardsArguments());
    const xml = await response.text();

    expect(xml).toContain('<loc>https://shine-film.com/awards</loc>');
    expect(xml).toContain('<loc>https://shine-film.com/awards/palme-dor</loc>');
    expect(xml).toContain(
      '<loc>https://shine-film.com/awards/academy-best-picture</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shine-film.com/awards/japan-academy-best-picture</loc>',
    );
  });

  it('リスト型の賞は2ページ目以降のURLも列挙する', async () => {
    mockSearchResponse({awards: [{slug: '1001-movies', grouping: 'list'}]});
    mockSearchResponse({pagination: {totalPages: 3}});

    const response = await sitemapAwardsLoader(createAwardsArguments());
    const xml = await response.text();

    expect(xml).toContain(
      '<loc>https://shine-film.com/awards/1001-movies</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shine-film.com/awards/1001-movies?page=2</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shine-film.com/awards/1001-movies?page=3</loc>',
    );
    expect(xml).not.toContain('?page=4');
  });

  it('1ページに収まるリスト型の賞はページURLを出さない', async () => {
    mockSearchResponse({awards: [{slug: 'variety-top-100', grouping: 'list'}]});
    mockSearchResponse({pagination: {totalPages: 1}});

    const response = await sitemapAwardsLoader(createAwardsArguments());
    const xml = await response.text();

    expect(xml).not.toContain('?page=');
  });

  it('API取得に失敗しても200で/awardsのみのurlsetを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await sitemapAwardsLoader(createAwardsArguments());
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://shine-film.com/awards</loc>');
  });
});
