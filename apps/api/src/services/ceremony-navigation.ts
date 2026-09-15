type Sibling = {uid: string; year: number; ceremonyNumber: number | null};

export type CeremonyNavigationEntry = {
  uid: string;
  year: number;
  ceremonyNumber: number | undefined;
};

const compareSiblings = (a: Sibling, b: Sibling): number => {
  if (a.year !== b.year) {
    return a.year - b.year;
  }

  const aNumber = a.ceremonyNumber ?? Number.MAX_SAFE_INTEGER;
  const bNumber = b.ceremonyNumber ?? Number.MAX_SAFE_INTEGER;

  if (aNumber < bNumber) {
    return -1;
  }

  if (aNumber > bNumber) {
    return 1;
  }

  return 0;
};

const toEntry = (sibling: Sibling | undefined) =>
  sibling
    ? {
        uid: sibling.uid,
        year: sibling.year,
        ceremonyNumber: sibling.ceremonyNumber ?? undefined,
      }
    : undefined;

/** 同じ団体の授賞式を年・回次の順に並べ、前後の授賞式を返す */
export function ceremonyNavigation(
  siblings: Sibling[],
  ceremonyUid: string,
): {
  previous: CeremonyNavigationEntry | undefined;
  next: CeremonyNavigationEntry | undefined;
} {
  const sorted = siblings.toSorted(compareSiblings);
  const currentIndex = sorted.findIndex(sibling => sibling.uid === ceremonyUid);
  if (currentIndex === -1) {
    return {previous: undefined, next: undefined};
  }

  return {
    previous: toEntry(sorted[currentIndex - 1]),
    next: toEntry(sorted[currentIndex + 1]),
  };
}
