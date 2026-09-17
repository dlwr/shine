import type {MovieDetails} from '@/components/admin/movie-info/types';

export type Translation = MovieDetails['translations'][number];

export type TranslationValues = {
  languageCode: string;
  content: string;
  isDefault: boolean;
};
