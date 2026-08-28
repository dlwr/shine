import {describe, expect, it} from 'vitest';
import {
  filmReferenceKey,
  resolveFilmReferences,
} from '../common/film-reference-resolver';
import type {
  FilmReference,
  ResolvedFilm,
} from '../common/wikidata-film-resolver';

const WINDOW = {min: -1, max: 1};

function reference(key: string, title: string, targetYear: number) {
  return {key, title, targetYear, yearWindow: WINDOW, foreign: false};
}

const SCHOOL: ResolvedFilm = {
  imdbId: 'tt0202364',
  englishTitle: 'A Class to Remember',
  publicationYear: 1993,
};

describe('filmReferenceKey', () => {
  it('記事名と年を結ぶ', () => {
    expect(filmReferenceKey({page: '学校 (映画)', title: '学校II'}, 1996)).toBe(
      '学校 (映画)@1996',
    );
  });

  it('記事の無い作品は題名を使う', () => {
    expect(filmReferenceKey({title: '楢山節考'}, 1962)).toBe(
      'title:楢山節考@1962',
    );
  });
});

describe('resolveFilmReferences', () => {
  it('同じ記事は1回だけ引く', async () => {
    const pages: string[][] = [];
    const references: FilmReference[] = [
      reference('学校 (映画)@1993', '学校', 1993),
      reference('学校 (映画)@1996', '学校II', 1996),
    ];

    await resolveFilmReferences({
      references,
      tmdbApiKey: undefined,
      throttleMs: 0,
      async resolvePages(requested) {
        pages.push(requested);
        return new Map([['学校 (映画)', SCHOOL]]);
      },
      fetchReleaseYear: async () => 1993,
    });

    expect(pages).toEqual([['学校 (映画)']]);
  });

  it('記事の作品と年が合わない参照は落とす', async () => {
    const references: FilmReference[] = [
      reference('学校 (映画)@1993', '学校', 1993),
      reference('学校 (映画)@1996', '学校II', 1996),
    ];

    const resolved = await resolveFilmReferences({
      references,
      tmdbApiKey: undefined,
      throttleMs: 0,
      resolvePages: async () => new Map([['学校 (映画)', SCHOOL]]),
      fetchReleaseYear: async () => 1993,
    });

    expect(resolved.keys().toArray()).toEqual(['学校 (映画)@1993']);
  });

  it('題名だけの参照は記事を引かない', async () => {
    const pages: string[][] = [];

    await resolveFilmReferences({
      references: [reference('title:楢山節考@1962', '楢山節考', 1962)],
      tmdbApiKey: undefined,
      throttleMs: 0,
      async resolvePages(requested) {
        pages.push(requested);
        return new Map();
      },
    });

    expect(pages).toEqual([]);
  });
});
