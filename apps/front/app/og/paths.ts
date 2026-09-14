export const OG_PATHS = [
  '/og/movie.png',
  '/og/person.png',
  '/og/home.png',
  '/og/banner.png',
  '/og/quiz.png',
  '/og/watched.png',
  '/quiz/poster.png',
] as const;

export type OgPath = (typeof OG_PATHS)[number];

export function isOgPath(pathname: string): pathname is OgPath {
  return (OG_PATHS as readonly string[]).includes(pathname);
}
