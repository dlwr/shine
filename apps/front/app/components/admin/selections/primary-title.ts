import type {SearchMovie, SelectionData} from './types';

export function getPrimaryTitle(
  movie: SelectionData['movie'] | SearchMovie | undefined,
): string {
  return movie?.title || '無題';
}
