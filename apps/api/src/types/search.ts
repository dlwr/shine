import type {PaginationOptions} from './common';
import type {ProminentPerson} from './people';

export type SearchOptions = {
  query?: string;
  year?: number;
  language?: string;
  hasAwards?: boolean;
  matchPeople?: boolean;
} & PaginationOptions;

type SuggestedMovie = {
  uid: string;
  title: string;
  year: number | undefined;
};

export type SearchSuggestions = {
  movies: SuggestedMovie[];
  people: ProminentPerson[];
};
