import {type SelectionMovie} from '../api-client';
import {buildAvailabilityLabels} from '../availability-labels';
import {buildOrganizationLabels} from '../organization-names';
import {SITE_URL} from '../site';

const MAX_TEXT_ORGANIZATIONS = 2;
const MAX_TEXT_AVAILABILITY = 2;

export async function buildSelectionPostInput(movie: SelectionMovie) {
  const organizations = buildOrganizationLabels(movie.nominations ?? []);
  const availabilityLabels = buildAvailabilityLabels(movie.availability ?? []);

  return {
    title: movie.title!,
    year: movie.year,
    organizations: organizations.slice(0, MAX_TEXT_ORGANIZATIONS),
    availabilityLabels: availabilityLabels.slice(0, MAX_TEXT_AVAILABILITY),
  };
}

export function buildMovieLink(movie: SelectionMovie, description: string) {
  return {
    link: {
      uri: `${SITE_URL}/movies/${movie.uid}`,
      title: `${movie.title}${movie.year ? ` (${movie.year})` : ''} | SHINE`,
      description,
    },
    imageUrl: `${SITE_URL}/og/movie.png?id=${movie.uid}`,
  };
}
