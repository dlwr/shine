export type ProfileDisplaySize = 'w185' | 'w342' | 'h632';

export function profileImageUrl(
  profilePath: string | undefined,
  size: ProfileDisplaySize,
): string | undefined {
  if (!profilePath) {
    return undefined;
  }

  return profilePath.startsWith('/')
    ? `https://image.tmdb.org/t/p/${size}${profilePath}`
    : profilePath;
}
