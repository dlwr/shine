import type {ImdbEventAwardConfig} from './imdb-event-award';

// 1940-1942(戦時開催)と1946年は公式回次に数えられない
// (第8回=1947年、第36回=1979年、1973-1978年は未開催または非公式)
export function veniceCeremonyNumber(year: number): number | undefined {
  if (year === 1932) {
    return 1;
  }

  if (year >= 1934 && year <= 1939) {
    return year - 1932;
  }

  if (year >= 1947 && year <= 1972) {
    return year - 1939;
  }

  if (year === 1979) {
    return 36;
  }

  if (year >= 1980) {
    return year - 1943;
  }

  return undefined;
}

export const veniceConfig: ImdbEventAwardConfig = {
  organizationName: 'Venice Film Festival',
  organizationCountry: 'Italy',
  establishedYear: 1932,
  categoryName: 'Golden Lion',
  ceremonyNumber: veniceCeremonyNumber,
  isCompetitionCategory: category =>
    category === null || category === 'Best Film',
  minimumFilmsPerEdition: 2,
};
