import type {ImdbEventAwardConfig} from './imdb-event-award';

// 1951年の第1回から毎年開催されている(1970年は審査中止だが第20回として数える)
export function berlinCeremonyNumber(year: number): number | undefined {
  if (year < 1951) {
    return undefined;
  }

  return year - 1950;
}

const NON_COMPETITION_CATEGORY =
  /short|feature-length documentary|audience poll/i;

export const berlinConfig: ImdbEventAwardConfig = {
  organizationName: 'Berlin International Film Festival',
  organizationCountry: 'Germany',
  establishedYear: 1951,
  categoryName: 'Golden Bear',
  ceremonyNumber: berlinCeremonyNumber,
  // 1951年はジャンル別に授与されたので全部門を取り込む。短編部門と、
  // 1956年以降に本賞と別枠で出た長編ドキュメンタリー部門・観客投票は対象外
  isCompetitionCategory: category =>
    category === null || !NON_COMPETITION_CATEGORY.test(category),
  minimumFilmsPerEdition: 1,
  // IMDbはParadise Now(2005年コンペ出品・受賞なし)を2006年の受賞作として
  // 二重登録している。2006年の金熊賞はGrbavicaのみ
  winnerCorrections: [{year: 2006, imdbId: 'tt0445620', isWinner: false}],
};
