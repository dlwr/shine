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
