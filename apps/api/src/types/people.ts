import type {Pagination} from './common';

type PersonAwardTag = {
  slug: string;
  isWinner: boolean;
};

type PersonalAward = {
  slug: string | undefined;
  organization: string;
  category: string;
  /** 授賞式の年。第17回までは1回の受賞に複数作品が紐づくので、回数はこれで数える */
  year: number;
  isWinner: boolean;
};

type PersonAwardLegend = {
  slug: string;
  shortLabel: string;
  name: string;
  organization: string;
  grouping: 'year' | 'list';
};

export type PersonDetail = {
  uid: string;
  name: string;
  originalName: string;
  profilePath: string | undefined;
  credits: Array<{
    movieUid: string;
    title: string | undefined;
    year: number | undefined;
    posterUrl: string | undefined;
    jobs: string[];
    character: string | undefined;
    awards: PersonAwardTag[];
    personAwards: PersonalAward[];
  }>;
  awards: PersonAwardLegend[];
};

type PersonSummary = {
  uid: string;
  name: string;
  movieCount: number;
};

export type PeopleListResult = {
  people: PersonSummary[];
  pagination: Pagination;
};

export type ProminentPersonMovie = {
  uid: string;
  title: string | undefined;
  year: number | undefined;
};

export type ProminentPerson = {
  uid: string;
  name: string;
  originalName: string;
  profilePath: string | undefined;
  wonCount: number;
  nominatedCount: number;
  topMovies: ProminentPersonMovie[];
};

export type ProminentPeople = {
  directors: ProminentPerson[];
  actors: ProminentPerson[];
};

export type PeopleSearchResult = {
  people: ProminentPerson[];
};
