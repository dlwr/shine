import {SITE_URL} from './meta';
import type {MovieDetailData} from './movie-detail';

export function isMonthlyPick(
  matches: readonly ({id?: string; loaderData?: unknown} | undefined)[],
  movieUid: string | undefined,
): boolean {
  const root = matches.find(match => match?.id === 'root');
  const {monthly} = (root?.loaderData ?? {}) as {monthly?: {uid?: string}};

  return Boolean(movieUid) && monthly?.uid === movieUid;
}

const MAX_DESCRIPTION_ORGANIZATIONS = 3;

export function summarizeOrganizations(
  nominations: MovieDetailData['nominations'],
): string {
  const names = [
    ...new Set(
      nominations.map(
        nomination =>
          nomination.organization.displayName ||
          nomination.organization.shortName ||
          nomination.organization.name,
      ),
    ),
  ];

  return names.slice(0, MAX_DESCRIPTION_ORGANIZATIONS).join('・');
}

const MAX_META_DESCRIPTION_LENGTH = 120;

export function buildMetaDescription(
  headline: string,
  synopsis: string | undefined,
): string {
  const room = MAX_META_DESCRIPTION_LENGTH - [...headline].length;

  if (!synopsis || room <= 0) {
    return `${headline}いま配信・レンタルで観られるかをまとめています。`;
  }

  const characters = [...synopsis];

  return characters.length > room
    ? `${headline}${characters.slice(0, room - 1).join('')}…`
    : `${headline}${synopsis}`;
}

export function buildMovieJsonLd(
  movieDetail: MovieDetailData,
): Record<string, unknown> {
  const awards = movieDetail.nominations
    .filter(nomination => nomination.isWinner)
    .map(nomination => {
      const organization =
        nomination.organization.displayName ?? nomination.organization.name;
      const category =
        nomination.category.displayName ?? nomination.category.name;

      return `${organization} ${category} (${nomination.ceremony.year})`;
    });

  return {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movieDetail.title,
    url: `${SITE_URL}/movies/${movieDetail.uid}`,
    ...(movieDetail.posterUrl && {image: movieDetail.posterUrl}),
    ...(movieDetail.description && {description: movieDetail.description}),
    ...(movieDetail.year && {datePublished: String(movieDetail.year)}),
    ...(movieDetail.imdbUrl && {sameAs: movieDetail.imdbUrl}),
    ...(awards.length > 0 && {award: awards}),
  };
}
