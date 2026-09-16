import type {PosterInfo} from '@/lib/poster';

type TranslationInfo = {
  languageCode: string;
  content: string;
  isDefault: number;
};

export type MovieCardOrganization = {
  uid: string;
  name: string;
  shortName?: string;
};

export type MovieCardCeremony = {
  uid: string;
  year: number;
  number?: number;
};

export type MovieCardNomination = {
  uid: string;
  isWinner: boolean;
  category: {name: string};
  ceremony: MovieCardCeremony;
  organization: MovieCardOrganization;
};

export type MovieCardArticleLink = {
  uid: string;
  url?: string;
  title?: string;
  description?: string;
  isSpam?: boolean;
};

export type MovieCardMovie = {
  uid: string;
  title?: string;
  year?: number;
  tmdbId?: string | number;
  imdbUrl?: string;
  posterUrl?: string;
  posterUrls?: PosterInfo[];
  translations?: TranslationInfo[];
  nominations?: MovieCardNomination[];
  articleLinks?: MovieCardArticleLink[];
};
