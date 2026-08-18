import {hasJapaneseText} from '@shine/availability';
import {type Movie} from './repository';

type ExistingJapaneseTitle = {
  movieUid: string;
  content: string;
};

type SelectOptions = {
  /**
   * 原題がそのまま ja の translation として保存されている映画も対象に含める。
   * 例: "Pather Panchali"（邦題は「大地のうた」）
   */
  shouldIncludeNonJapanese: boolean;
};

export function selectMoviesNeedingJapaneseTitle<T extends Pick<Movie, 'uid'>>(
  candidates: T[],
  existingJapaneseTitles: ExistingJapaneseTitle[],
  {shouldIncludeNonJapanese}: SelectOptions,
): T[] {
  const satisfied = new Set(
    existingJapaneseTitles
      .filter(row => !shouldIncludeNonJapanese || hasJapaneseText(row.content))
      .map(row => row.movieUid),
  );

  return candidates.filter(candidate => !satisfied.has(candidate.uid));
}
