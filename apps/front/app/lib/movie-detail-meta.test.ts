import {describe, expect, it} from 'vitest';
import type {MovieDetailData} from './movie-detail';
import {
  buildMetaDescription,
  buildMovieJsonLd,
  summarizeOrganizations,
} from './movie-detail-meta';

type Nomination = MovieDetailData['nominations'][number];

const nomination = (
  overrides: {
    isWinner?: boolean;
    year?: number;
    category?: Partial<Nomination['category']>;
    organization?: Partial<Nomination['organization']>;
  } = {},
): Nomination => ({
  uid: 'nom',
  isWinner: overrides.isWinner ?? false,
  category: {uid: 'cat', name: 'Best Picture', ...overrides.category},
  ceremony: {uid: 'cer', year: overrides.year ?? 2023},
  organization: {uid: 'org', name: 'Academy Awards', ...overrides.organization},
});

const movieDetail = (
  overrides: Partial<MovieDetailData> = {},
): MovieDetailData => ({
  uid: 'movie-1',
  year: 2023,
  originalLanguage: 'ko',
  imdbId: 'tt1',
  tmdbId: 1,
  title: 'パラサイト',
  nominations: [],
  articleLinks: [],
  ...overrides,
});

describe('summarizeOrganizations', () => {
  it('表示名を優先して団体名を並べる', () => {
    expect(
      summarizeOrganizations([
        nomination({
          organization: {
            name: 'Academy Awards',
            shortName: 'Oscars',
            displayName: 'アカデミー賞',
          },
        }),
      ]),
    ).toBe('アカデミー賞');
  });

  it('表示名が無ければ略称を使う', () => {
    expect(
      summarizeOrganizations([
        nomination({
          organization: {name: 'Academy Awards', shortName: 'Oscars'},
        }),
      ]),
    ).toBe('Oscars');
  });

  it('表示名も略称も無ければ正式名を使う', () => {
    expect(summarizeOrganizations([nomination()])).toBe('Academy Awards');
  });

  it('同じ団体は一度だけ数える', () => {
    expect(summarizeOrganizations([nomination(), nomination()])).toBe(
      'Academy Awards',
    );
  });

  it('団体名は中黒で繋ぐ', () => {
    expect(
      summarizeOrganizations([
        nomination({organization: {name: 'A'}}),
        nomination({organization: {name: 'B'}}),
      ]),
    ).toBe('A・B');
  });

  it('団体は 3 つまでに絞る', () => {
    expect(
      summarizeOrganizations([
        nomination({organization: {name: 'A'}}),
        nomination({organization: {name: 'B'}}),
        nomination({organization: {name: 'C'}}),
        nomination({organization: {name: 'D'}}),
      ]),
    ).toBe('A・B・C');
  });
});

describe('buildMetaDescription', () => {
  it('あらすじが無ければ配信状況の案内を続ける', () => {
    expect(buildMetaDescription('見出し。', undefined)).toBe(
      '見出し。いま配信・レンタルで観られるかをまとめています。',
    );
  });

  it('あらすじが収まるならそのまま続ける', () => {
    expect(buildMetaDescription('見出し。', 'あらすじ')).toBe(
      '見出し。あらすじ',
    );
  });

  it('全体が 120 文字に収まるようにあらすじを切り詰める', () => {
    const description = buildMetaDescription('見出し。', 'あ'.repeat(200));

    expect([...description]).toHaveLength(120);
  });

  it('切り詰めた末尾に三点リーダーを付ける', () => {
    expect(buildMetaDescription('見出し。', 'あ'.repeat(200))).toMatch(/…$/);
  });

  it('見出しだけで 120 文字を超えるなら配信状況の案内を続ける', () => {
    const headline = 'あ'.repeat(120);

    expect(buildMetaDescription(headline, 'あらすじ')).toBe(
      `${headline}いま配信・レンタルで観られるかをまとめています。`,
    );
  });
});

describe('buildMovieJsonLd', () => {
  it('schema.org の Movie を返す', () => {
    expect(buildMovieJsonLd(movieDetail())).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Movie',
      name: 'パラサイト',
    });
  });

  it('url に映画ページの絶対 URL を入れる', () => {
    expect(buildMovieJsonLd(movieDetail()).url).toBe(
      'https://shine-film.com/movies/movie-1',
    );
  });

  it('datePublished に製作年を文字列で入れる', () => {
    expect(buildMovieJsonLd(movieDetail()).datePublished).toBe('2023');
  });

  it('ポスターがあれば image に入れる', () => {
    expect(
      buildMovieJsonLd(movieDetail({posterUrl: 'https://img/p.jpg'})).image,
    ).toBe('https://img/p.jpg');
  });

  it('ポスターが無ければ image キーを持たない', () => {
    expect(buildMovieJsonLd(movieDetail())).not.toHaveProperty('image');
  });

  it('あらすじがあれば description に入れる', () => {
    expect(
      buildMovieJsonLd(movieDetail({description: '概要'})).description,
    ).toBe('概要');
  });

  it('IMDb の URL があれば sameAs に入れる', () => {
    expect(
      buildMovieJsonLd(
        movieDetail({imdbUrl: 'https://www.imdb.com/title/tt1/'}),
      ).sameAs,
    ).toBe('https://www.imdb.com/title/tt1/');
  });

  it('award には受賞したノミネーションだけを団体・部門・年で入れる', () => {
    expect(
      buildMovieJsonLd(
        movieDetail({
          nominations: [
            nomination({
              isWinner: true,
              year: 2019,
              category: {displayName: 'パルム・ドール'},
              organization: {displayName: 'カンヌ国際映画祭'},
            }),
            nomination({isWinner: false}),
          ],
        }),
      ).award,
    ).toEqual(['カンヌ国際映画祭 パルム・ドール (2019)']);
  });

  it('受賞が無ければ award キーを持たない', () => {
    expect(
      buildMovieJsonLd(movieDetail({nominations: [nomination()]})),
    ).not.toHaveProperty('award');
  });
});
