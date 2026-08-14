const TMDB_POSTER_PATTERN =
  /^(https:\/\/image\.tmdb\.org\/t\/p\/)(original|w(\d+))(\/)/;

export type PosterDisplaySize = 'w185' | 'w342' | 'w500';

const DISPLAY_WIDTHS: Record<PosterDisplaySize, number> = {
  w185: 185,
  w342: 342,
  w500: 500,
};

/**
 * TMDbのポスターURLを表示幅相当まで落とす。原寸は1枚800KB超あり、
 * サムネイル表示には過大なため。元より大きいサイズへの引き上げはしない。
 */
export function posterUrlForDisplay(
  url: string | undefined,
  size: PosterDisplaySize,
): string | undefined {
  if (!url) {
    return url;
  }

  const match = TMDB_POSTER_PATTERN.exec(url);
  if (!match) {
    return url;
  }

  const [, prefix, current, currentWidth, suffix] = match;
  if (current !== 'original' && Number(currentWidth) <= DISPLAY_WIDTHS[size]) {
    return url;
  }

  return url.replace(TMDB_POSTER_PATTERN, `${prefix}${size}${suffix}`);
}
