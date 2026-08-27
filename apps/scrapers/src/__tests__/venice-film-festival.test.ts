import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {extractAwardEditions} from '../imdb-event-award';
import type {ImdbEventCollectedData} from '../imdb-event-award';
import {veniceConfig} from '../venice-film-festival';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(
  currentDirectory,
  '../../data/venice-golden-lion.json',
);

describe('veniceConfig.isCompetitionCategory', () => {
  it('未分類（null）とBest Filmを取り込む', () => {
    // eslint-disable-next-line unicorn/no-null -- IMDbは未分類カテゴリをnullで返す
    expect(veniceConfig.isCompetitionCategory(null)).toBe(true);
    expect(veniceConfig.isCompetitionCategory('Best Film')).toBe(true);
  });

  it('VR部門を取り込まない', () => {
    expect(veniceConfig.isCompetitionCategory('Immersive VR')).toBe(false);
  });
});

const data = JSON.parse(
  readFileSync(dataPath, 'utf8'),
) as ImdbEventCollectedData;
const editions = extractAwardEditions(data, veniceConfig);

const winnersOf = (year: number) =>
  editions
    .find(entry => entry.year === year)
    ?.films.filter(film => film.isWinner)
    .map(film => film.originalTitle);

describe('収集済みデータ', () => {
  it('1949年から2026年までの67回を取り込む', () => {
    expect(editions).toHaveLength(67);
    expect(editions[0].year).toBe(1949);
    expect(editions.at(-1)?.year).toBe(2026);
  });

  it('既知の受賞作を受賞として取り込む', () => {
    expect(winnersOf(1951)).toEqual(['Rashômon']);
    expect(winnersOf(2019)).toEqual(['Joker']);
    expect(winnersOf(2023)).toEqual(['Poor Things']);
  });

  it('同時受賞の年は受賞作を2件持つ', () => {
    const films = editions.find(entry => entry.year === 1959)?.films ?? [];
    expect(films.filter(film => film.isWinner)).toHaveLength(2);
  });

  it('受賞なしの年（1953年・審査で該当なし）は受賞作を持たない', () => {
    const films = editions.find(entry => entry.year === 1953)?.films ?? [];
    expect(films.filter(film => film.isWinner)).toHaveLength(0);
  });

  it('imdbIdはすべてtt形式', () => {
    const allFilms = editions.flatMap(entry => entry.films);
    expect(allFilms.every(film => /^tt\d+$/.test(film.imdbId))).toBe(true);
  });

  it('すべての映画に使えるタイトルがある', () => {
    const allFilms = editions.flatMap(entry => entry.films);
    expect(
      allFilms.every(film => (film.originalTitle ?? film.title ?? '') !== ''),
    ).toBe(true);
  });
});
