import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {berlinCeremonyNumber, berlinConfig} from '../berlin-film-festival';
import {extractAwardEditions} from '../imdb-event-award';
import type {ImdbEventCollectedData} from '../imdb-event-award';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(
  currentDirectory,
  '../../data/berlin-golden-bear.json',
);

describe('berlinCeremonyNumber', () => {
  it('第1回は1951年', () => {
    expect(berlinCeremonyNumber(1951)).toBe(1);
  });

  it('毎年開催なので年-1950', () => {
    expect(berlinCeremonyNumber(1970)).toBe(20);
    expect(berlinCeremonyNumber(2000)).toBe(50);
    expect(berlinCeremonyNumber(2026)).toBe(76);
  });

  it('第1回より前はundefined', () => {
    expect(berlinCeremonyNumber(1950)).toBeUndefined();
  });
});

describe('berlinConfig.isCompetitionCategory', () => {
  it('未分類（null）と長編部門を取り込む', () => {
    // eslint-disable-next-line unicorn/no-null -- IMDbは未分類カテゴリをnullで返す
    expect(berlinConfig.isCompetitionCategory(null)).toBe(true);
    expect(berlinConfig.isCompetitionCategory('Best Film')).toBe(true);
    expect(berlinConfig.isCompetitionCategory('Competition')).toBe(true);
  });

  it('初期のジャンル別金熊賞・観客投票を取り込む', () => {
    expect(berlinConfig.isCompetitionCategory('Best Drama')).toBe(true);
    expect(berlinConfig.isCompetitionCategory('Best Musical')).toBe(true);
    expect(berlinConfig.isCompetitionCategory('Audience Poll')).toBe(true);
  });

  it('長編ドキュメンタリー部門を取り込む', () => {
    expect(
      berlinConfig.isCompetitionCategory('Best Feature-Length Documentary'),
    ).toBe(true);
  });

  it('短編部門を取り込まない', () => {
    expect(berlinConfig.isCompetitionCategory('Best Short Film')).toBe(false);
    expect(berlinConfig.isCompetitionCategory('Short Film')).toBe(false);
    expect(berlinConfig.isCompetitionCategory('Best Short film')).toBe(false);
    expect(
      berlinConfig.isCompetitionCategory(
        'Best Short Documentary/Cultural Film',
      ),
    ).toBe(false);
  });
});

const data = JSON.parse(
  readFileSync(dataPath, 'utf8'),
) as ImdbEventCollectedData;
const editions = extractAwardEditions(data, berlinConfig);

const winnersOf = (year: number) =>
  editions
    .find(entry => entry.year === year)
    ?.films.filter(film => film.isWinner)
    .map(film => film.originalTitle);

describe('収集済みデータ', () => {
  it('1951年から2026年までの76回を欠年なく取り込む', () => {
    expect(editions).toHaveLength(76);
    expect(editions[0].year).toBe(1951);
    expect(editions.at(-1)?.year).toBe(2026);
    expect(
      editions.every((entry, index) =>
        index === 0 ? true : entry.year === editions[index - 1].year + 1,
      ),
    ).toBe(true);
  });

  it('既知の受賞作を受賞として取り込む', () => {
    expect(winnersOf(1953)).toEqual(['Le salaire de la peur']);
    expect(winnersOf(2024)).toEqual(['Dahomey']);
    expect(winnersOf(2025)).toEqual(['Drømmer']);
  });

  it('ジャンル別に授与された1951年は受賞作を5件持つ', () => {
    const films = editions.find(entry => entry.year === 1951)?.films ?? [];
    expect(films.filter(film => film.isWinner)).toHaveLength(5);
  });

  it('審査が中止された1970年は受賞作を持たない', () => {
    const films = editions.find(entry => entry.year === 1970)?.films ?? [];
    expect(films.length).toBeGreaterThan(0);
    expect(films.filter(film => film.isWinner)).toHaveLength(0);
  });

  it('短編部門の作品を取り込まない', () => {
    const shortFilmIds = new Set(
      data.editions.flatMap(edition =>
        edition.targetAward.flatMap(award =>
          award.categories
            .filter(category => /short/i.test(category.category ?? ''))
            .flatMap(category =>
              category.nominations.flatMap(entry =>
                entry.titles.map(title => title.imdbId),
              ),
            ),
        ),
      ),
    );
    const importedIds = new Set(
      editions.flatMap(entry => entry.films.map(film => film.imdbId)),
    );

    expect(shortFilmIds.size).toBeGreaterThan(0);
    expect([...shortFilmIds].filter(id => importedIds.has(id))).toEqual([]);
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
