export type AvailabilitySource = 'tmdb' | 'unext' | 'discas' | 'geo';

export type AvailabilityStatus = 'ok' | 'ng' | 'error';

export type SourceCheckResult = {
  source: AvailabilitySource;
  status: AvailabilityStatus;
  detail?: string;
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
