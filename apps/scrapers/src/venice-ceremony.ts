// 1940-1942(戦時開催)と1946年は公式回次に数えられない
// (第8回=1947年、第34回=1975年、第35回=1976年、第36回=1979年。1973-1974年と1977-1978年は未開催)
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

  if (year === 1975 || year === 1976) {
    return year - 1941;
  }

  if (year === 1979) {
    return 36;
  }

  if (year >= 1980) {
    return year - 1943;
  }

  return undefined;
}

export function veniceCeremonyYear(ceremonyNumber: number): number {
  if (ceremonyNumber === 1) {
    return 1932;
  }

  if (ceremonyNumber <= 7) {
    return ceremonyNumber + 1932;
  }

  if (ceremonyNumber <= 33) {
    return ceremonyNumber + 1939;
  }

  if (ceremonyNumber <= 35) {
    return ceremonyNumber + 1941;
  }

  if (ceremonyNumber === 36) {
    return 1979;
  }

  return ceremonyNumber + 1943;
}
