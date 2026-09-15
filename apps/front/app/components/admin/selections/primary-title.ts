import type {SearchMovie, SelectionData} from './types';

export function getPrimaryTitle(
  movie: SelectionData['movie'] | SearchMovie,
): string {
  if (!movie) {
    return '無題';
  }

  if (movie.title) {
    return movie.title;
  }

  if ('translations' in movie && movie.translations) {
    return (
      movie.translations.find(translation => translation.isDefault === 1)
        ?.content ||
      movie.translations.find(translation => translation.languageCode === 'ja')
        ?.content ||
      movie.translations[0]?.content ||
      '無題'
    );
  }

  return '無題';
}
