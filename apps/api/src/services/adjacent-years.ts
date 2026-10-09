export function adjacentYears(
  years: number[],
  year: number,
): {previousYear: number | undefined; nextYear: number | undefined} {
  const sortedYears = years.toSorted((a, b) => a - b);
  return {
    previousYear: sortedYears.findLast(value => value < year),
    nextYear: sortedYears.find(value => value > year),
  };
}
