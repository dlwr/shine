import type {Context} from 'hono';

type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
};

export const parsePagination = (
  c: Context,
  {defaultLimit = 20, maxLimit = 100}: PaginationOptions = {},
): {page: number; limit: number} => ({
  page: parsePositiveInteger(c.req.query('page'), 1),
  limit: Math.min(
    parsePositiveInteger(c.req.query('limit'), defaultLimit),
    maxLimit,
  ),
});
