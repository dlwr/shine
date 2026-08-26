// 1946年開始、1948年と1950年は未開催（2020年は中止だが第73回として数える）
export function cannesCeremonyNumber(year: number): number | undefined {
  if (year === 1946 || year === 1947) {
    return year - 1945;
  }

  if (year === 1949) {
    return 3;
  }

  if (year >= 1951) {
    return year - 1947;
  }

  return undefined;
}

export function cannesCeremonyYear(ceremonyNumber: number): number {
  if (ceremonyNumber <= 2) {
    return ceremonyNumber + 1945;
  }

  if (ceremonyNumber === 3) {
    return 1949;
  }

  return ceremonyNumber + 1947;
}
