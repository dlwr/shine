import {readFileSync, rmSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {drizzle as drizzleD1} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {getPlatformProxy} from 'wrangler';
import {seedPublicData} from '../../api/src/__tests__/public-data-seed';
import {fixedNow} from './clock';
import {apiPort} from './ports';
import {seedLayoutStressData} from './seed';

const vrtDirectory = path.dirname(fileURLToPath(import.meta.url));
const stateDirectory = path.join(vrtDirectory, '.state');
const generatedDirectory = path.join(vrtDirectory, '.generated');

const seedDatabase = async () => {
  rmSync(stateDirectory, {recursive: true, force: true});
  const proxy = await getPlatformProxy<{DB: D1Database}>({
    configPath: path.join(vrtDirectory, 'wrangler.api.jsonc'),
    persist: {path: path.join(stateDirectory, 'v3')},
  });
  try {
    await migrate(drizzleD1(proxy.env.DB), {
      migrationsFolder: path.resolve(
        vrtDirectory,
        '../../../packages/database/migrations',
      ),
    });
    const database = getDatabase({DB: proxy.env.DB});
    await seedPublicData(database);
    await seedLayoutStressData(database);
    await pinTimestamps(proxy.env.DB);
  } finally {
    await proxy.dispose();
  }
};

const timestampColumns = new Set([
  'created_at',
  'updated_at',
  'checked_at',
  'submitted_at',
]);

const pinTimestamps = async (binding: D1Database) => {
  const seconds = Math.floor(fixedNow / 1000);
  const {results: tables} = await binding
    .prepare(
      String.raw`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%search%' AND name NOT LIKE '\_%' ESCAPE '\'`,
    )
    .all<{name: string}>();
  const statements = [];
  for (const {name} of tables) {
    const {results: columns} = await binding
      .prepare(`PRAGMA table_info("${name}")`)
      .all<{name: string}>();
    for (const column of columns) {
      if (timestampColumns.has(column.name)) {
        statements.push(
          binding
            .prepare(`UPDATE "${name}" SET "${column.name}" = ?`)
            .bind(seconds),
        );
      }
    }
  }

  await binding.batch(statements);
};

const redirectedConfigKeys = new Set([
  'configPath',
  'userConfigPath',
  'topLevelName',
  'definedEnvironments',
  'targetEnvironment',
  'no_bundle',
]);

const writeFrontConfig = () => {
  const built = JSON.parse(
    readFileSync(
      path.resolve(vrtDirectory, '../build/server/wrangler.json'),
      'utf8',
    ),
  ) as Record<string, unknown> & {
    services?: unknown[];
    vars?: Record<string, string>;
  };
  if (built.services && built.services.length > 0) {
    throw new Error(
      'front のビルドに service binding が入っています。CLOUDFLARE_ENV=development でビルドしてください',
    );
  }

  const config = Object.fromEntries(
    Object.entries(built).filter(([key]) => !redirectedConfigKeys.has(key)),
  );
  mkdirSync(generatedDirectory, {recursive: true});
  writeFileSync(
    path.join(generatedDirectory, 'wrangler.front.json'),
    JSON.stringify({
      ...config,
      name: 'shine-front-vrt',
      main: '../front-worker.ts',
      assets: {directory: '../../build/client'},
      vars: {
        ...built.vars,
        PUBLIC_API_URL: `http://localhost:${apiPort}`,
        QUIZ_ANSWER_KEY: 'vrt-quiz-answer-key',
      },
    }),
  );
};

await seedDatabase();
writeFrontConfig();
