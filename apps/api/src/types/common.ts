import type {Environment, getDatabase} from '@shine/database';

export type ServiceContext = {
  env: Environment;
  database: ReturnType<typeof getDatabase>;
};

export type PaginationOptions = {
  page: number;
  limit: number;
};

export type Pagination = {
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
};

export type WatchableAvailability = {
  source: string;
  detail: string | undefined;
  checkedAt: number;
};

/**
 * 日本で観られるかの判定。source ごとの最新の確認から決める。
 * `rental_only` は DISCAS だけが ok の映画で、邦題の完全一致に別作品の混入があるので分けて扱う
 */
export type JapanAvailabilityStatus =
  'watchable' | 'rental_only' | 'unwatchable' | 'unchecked';

export type JapanAvailabilitySummary = {
  total: number;
  watchable: number;
  rentalOnly: number;
  unwatchable: number;
  unchecked: number;
};
