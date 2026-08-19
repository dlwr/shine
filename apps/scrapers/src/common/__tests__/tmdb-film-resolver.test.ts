import {describe, expect, it, vi} from 'vitest';
import {resolveRemainingByTmdb} from '../tmdb-film-resolver';
import {
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from '../wikidata-film-resolver';

const WINDOW: YearWindow = {min: -1, max: 1};

function reference(key: string, title: string, year: number): FilmReference {
  return {key, title, targetYear: year, yearWindow: WINDOW, foreign: false};
}

describe('resolveRemainingByTmdb', () => {
  it('同定できていない作品だけを引き直す', async () => {
    const references = [
      reference('解決済み', '解決済み', 2024),
      reference('未解決', '未解決', 2024),
    ];
    const resolved = new Map<string, ResolvedFilm>([
      ['解決済み', {imdbId: 'tt1'}],
    ]);
    const resolveFilms = vi.fn().mockResolvedValue(new Map());

    await resolveRemainingByTmdb({
      references,
      resolved,
      tmdbApiKey: 'key',
      throttleMs: 0,
      resolveFilms,
    });

    expect(resolveFilms.mock.calls[0][0]).toEqual([
      {key: '未解決', title: '未解決', year: 2024, foreign: false},
    ]);
  });

  it('同じ記事を指す複数の作品は1回だけ引く', async () => {
    const references = [
      reference('学校', '学校', 1993),
      reference('学校', '学校II', 1996),
    ];
    const resolveFilms = vi.fn().mockResolvedValue(new Map());

    await resolveRemainingByTmdb({
      references,
      resolved: new Map(),
      tmdbApiKey: 'key',
      throttleMs: 0,
      resolveFilms,
    });

    expect(resolveFilms.mock.calls[0][0]).toHaveLength(1);
  });

  it('引けたものを解決結果に足す', async () => {
    const resolved = new Map<string, ResolvedFilm>();
    const resolveFilms = vi
      .fn()
      .mockResolvedValue(new Map([['未解決', {imdbId: 'tt2'}]]));

    const count = await resolveRemainingByTmdb({
      references: [reference('未解決', '未解決', 2024)],
      resolved,
      tmdbApiKey: 'key',
      throttleMs: 0,
      resolveFilms,
    });

    expect(count).toBe(1);
    expect(resolved.get('未解決')).toEqual({imdbId: 'tt2'});
  });

  it('APIキーが無ければ何もしない', async () => {
    const resolveFilms = vi.fn();

    const count = await resolveRemainingByTmdb({
      references: [reference('未解決', '未解決', 2024)],
      resolved: new Map(),
      tmdbApiKey: undefined,
      throttleMs: 0,
      resolveFilms,
    });

    expect(count).toBe(0);
    expect(resolveFilms).not.toHaveBeenCalled();
  });
});
