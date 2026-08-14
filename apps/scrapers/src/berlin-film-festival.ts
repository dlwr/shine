import type {ImdbEventAwardConfig} from './imdb-event-award';

// 1951年の第1回から毎年開催されている(1970年は審査中止だが第20回として数える)
export function berlinCeremonyNumber(year: number): number | undefined {
  if (year < 1951) {
    return undefined;
  }

  return year - 1950;
}

export const berlinConfig: ImdbEventAwardConfig = {
  organizationName: 'Berlin International Film Festival',
  organizationCountry: 'Germany',
  establishedYear: 1951,
  categoryName: 'Golden Bear',
  ceremonyNumber: berlinCeremonyNumber,
  // 初期はジャンル別・観客投票で長編に授与された。短編部門のみ対象外
  isCompetitionCategory: category =>
    category === null || !/short/i.test(category),
  minimumFilmsPerEdition: 1,
  // IMDbはParadise Now(2005年コンペ出品・受賞なし)を2006年の受賞作として
  // 二重登録している。2006年の金熊賞はGrbavicaのみ
  winnerCorrections: [{year: 2006, imdbId: 'tt0445620', isWinner: false}],
};
