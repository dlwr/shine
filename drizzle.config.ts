import {defineConfig} from 'drizzle-kit';

export default defineConfig({
  schema: './packages/database/src/schema/index.ts',
  out: './packages/database/migrations',
  dialect: 'sqlite',
  casing: 'snake_case',
});
