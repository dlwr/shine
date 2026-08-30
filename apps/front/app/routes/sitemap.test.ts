import {beforeEach, describe, expect, it, vi} from 'vitest';
import {loader as sitemapAwardsLoader} from './sitemap-awards';
import {loader as sitemapIndexLoader} from './sitemap-index';
import {loader as sitemapMoviesLoader} from './sitemap-movies';
import {loader as sitemapPeopleLoader} from './sitemap-people';
import {loader as sitemapYearsLoader} from './sitemap-years';
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

  it('年別のsitemapを列挙する', async () => {
    mockSearchResponse({pagination: {totalCount: 10}});

    const response = await sitemapIndexLoader(createIndexArguments());

    expect(await response.text()).toContain(
      '<loc>https://shine-film.com/sitemap/years.xml</loc>',
    );
  });

  it('人物の総件数から必要な数の人物sitemapを列挙する', async () => {
    mockSearchResponse({pagination: {totalCount: 10}});
    mockSearchResponse({people: [], pagination: {totalCount: 1200}});

    const response = await sitemapIndexLoader(createIndexArguments());
    const xml = await response.text();

    expect(xml).toContain(
      '<loc>https://shine-film.com/sitemap/people.xml?page=1</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shine-film.com/sitemap/people.xml?page=3</loc>',
    );
    expect(xml).not.toContain('people.xml?page=4');
  });

  it('API取得に失敗しても200でsitemapindexを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await sitemapIndexLoader(createIndexArguments());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<sitemapindex');
  });
});

const createPeopleArguments = (page: string) =>
  cast<Parameters<typeof sitemapPeopleLoader>[0]>({
    context: createMockContext(),
    request: new Request(
      `https://shine-film.com/sitemap/people.xml?page=${page}`,
    ),
    params: {},
  });

describe('sitemap/people.xml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('指定ページの人物URLを列挙する', async () => {
    mockSearchResponse({
      people: [
        {uid: 'person-1', name: '黒澤明', movieCount: 30},
        {uid: 'person-2', name: '小津安二郎', movieCount: 20},
      ],
      pagination: {totalCount: 2},
    });

    const response = await sitemapPeopleLoader(createPeopleArguments('1'));
    const xml = await response.text();

    expect(xml).toContain('<loc>https://shine-film.com/people/person-1</loc>');
    expect(xml).toContain('<loc>https://shine-film.com/people/person-2</loc>');
  });

  it('指定されたページ番号と1ページの件数でAPIを呼ぶ', async () => {
    mockSearchResponse({people: [], pagination: {totalCount: 0}});

    await sitemapPeopleLoader(createPeopleArguments('3'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/people?page=3&limit=500'),
      expect.anything(),
    );
  });

  it('不正なページ番号には404を返す', async () => {
    const response = await sitemapPeopleLoader(createPeopleArguments('0'));

    expect(response.status).toBe(404);
  });

  it('API取得に失敗しても200で空のurlsetを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await sitemapPeopleLoader(createPeopleArguments('1'));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<urlset');
  });
});

const createYearsArguments = () =>
  cast<Parameters<typeof sitemapYearsLoader>[0]>({
    context: createMockContext(),
    request: new Request('https://shine-film.com/sitemap/years.xml'),
    params: {},
  });

describe('sitemap/years.xml', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('年一覧と各年ページのURLを列挙する', async () => {
    mockSearchResponse({
      years: [
        {year: 1997, movieCount: 91, winnerCount: 14},
        {year: 1953, movieCount: 92, winnerCount: 9},
      ],
    });

    const response = await sitemapYearsLoader(createYearsArguments());
    const xml = await response.text();

    expect(xml).toContain('<loc>https://shine-film.com/years</loc>');
    expect(xml).toContain('<loc>https://shine-film.com/years/1997</loc>');
    expect(xml).toContain('<loc>https://shine-film.com/years/1953</loc>');
  });

  it('API取得に失敗しても200で/yearsのみのurlsetを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await sitemapYearsLoader(createYearsArguments());
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://shine-film.com/years</loc>');
    expect(xml).not.toContain('/years/');
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

  it('年度制の最高賞には観た映画チェックのURLも列挙する', async () => {
    mockSearchResponse({
      awards: [
        {slug: 'palme-dor', grouping: 'year'},
        {slug: 'cannes-grand-prix', grouping: 'year', subAward: true},
        {slug: '1001-movies', grouping: 'list'},
      ],
    });
    mockSearchResponse({years: [{year: 2023}]});
    mockSearchResponse({years: [{year: 2023}]});
    mockSearchResponse({pagination: {totalPages: 1}});

    const response = await sitemapAwardsLoader(createAwardsArguments());
    const xml = await response.text();

    expect(xml).toContain('<loc>https://shine-film.com/watched</loc>');
    expect(xml).toContain(
      '<loc>https://shine-film.com/watched/palme-dor</loc>',
    );
    expect(xml).not.toContain('/watched/cannes-grand-prix');
    expect(xml).not.toContain('/watched/1001-movies');
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

  it('個人賞は賞ページのURLだけ列挙する', async () => {
    mockSearchResponse({
      awards: [{slug: 'japan-academy-director', grouping: 'person'}],
    });
    mockSearchResponse({years: [{year: 1994}]});

    const response = await sitemapAwardsLoader(createAwardsArguments());
    const xml = await response.text();

    expect(xml).toContain(
      '<loc>https://shine-film.com/awards/japan-academy-director</loc>',
    );
    expect(xml).not.toContain('/awards/japan-academy-director/1994');
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
