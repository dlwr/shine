import {simpleHash} from '../utils/hash';

const MINIMUM_GAP_MS = 365 * 86_400_000;
const MAX_ATTEMPTS = 64;

type Dated = {uid: string; releaseDate: string | undefined};

export function pickOrderPair<T extends Dated>(
  pool: readonly T[],
  date: string,
  excludedUid?: string,
): [T, T] | undefined {
  const candidates = pool.filter(
    entry => entry.releaseDate && entry.uid !== excludedUid,
  );
  if (candidates.length < 2) {
    return undefined;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const first =
      candidates[
        simpleHash(`quiz-order-${date}-a${attempt}`) % candidates.length
      ];
    const second =
      candidates[
        simpleHash(`quiz-order-${date}-b${attempt}`) % candidates.length
      ];
    const gap = Math.abs(
      Date.parse(first.releaseDate!) - Date.parse(second.releaseDate!),
    );
    if (gap >= MINIMUM_GAP_MS) {
      return [first, second];
    }
  }

  return undefined;
}
