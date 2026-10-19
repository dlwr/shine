import type {JapanAvailabilityStatus, JapanAvailabilitySummary} from './common';

export type YearSummary = {
  year: number;
  movieCount: number;
  winnerCount: number;
};

export type YearMovie = {
  uid: string;
  title: string | undefined;
  posterUrl: string | undefined;
  isWinner: boolean;
  availabilityStatus: JapanAvailabilityStatus;
  awards: Array<{slug: string; isWinner: boolean}>;
};

export type YearDetail = {
  year: number;
  availabilitySummary: JapanAvailabilitySummary;
  movies: YearMovie[];
  awards: Array<{
    slug: string;
    shortLabel: string;
    name: string;
    organization: string;
  }>;
  previousYear: number | undefined;
  nextYear: number | undefined;
};
