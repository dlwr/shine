import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, sql, type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {localizedPosterUrl} from '../localized-poster-url';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;
type PlanRow = {id: number; parent: number; detail: string};

describe('localizedPosterUrl の実行計画', () => {
  let database: Database;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({database, dispose} = await createD1TestDatabase({migrationsFolder}));
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('ロケールの言語のポスターを、映画のポスターを全部並べ替えずに索引の順で 1 行引く', async () => {
    const {sql: text, params} = database
      .select({posterUrl: localizedPosterUrl('en')})
      .from(movies)
      .where(eq(movies.uid, 'movie-1'))
      .toSQL();
    const pieces = text
      .split('?')
      .flatMap((chunk, index) =>
        index < params.length
          ? [sql.raw(chunk), sql`${params[index]}`]
          : [sql.raw(chunk)],
      );
    const rows = await database.all<PlanRow>(
      sql`EXPLAIN QUERY PLAN ${sql.join(pieces)}`,
    );

    const firstSubquery = rows.find(row =>
      row.detail.startsWith('CORRELATED SCALAR SUBQUERY'),
    );
    const firstSubquerySteps = rows
      .filter(row => row.parent === firstSubquery?.id)
      .map(row => row.detail);

    expect(firstSubquerySteps).toStrictEqual([
      expect.stringMatching(
        /^SEARCH poster_urls USING INDEX \S+ \(movie_uid=\? AND language_code=\?\)$/,
      ),
    ]);
  });
});
