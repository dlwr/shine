# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHINE is a comprehensive movie database project designed to be the world's most organized movie database. It collects and organizes movie information, awards, nominations, and multilingual translations. The project is built on Cloudflare Workers with Turso (libSQL) database.

## Architecture

pnpm workspace monorepo:

- **apps/api/** – Hono-based REST API on Cloudflare Workers
- **apps/front/** – React Router v7 frontend with SSR on Cloudflare Workers (Tailwind CSS v4)
- **apps/scrapers/** – CLI-based data collection tools (Wikipedia, TMDb, Cannes, Academy Awards, Japan Academy Awards, availability checks)
- **packages/database/** – Drizzle ORM schema, migrations, seeds, shared DB helpers
- **packages/types/** – Shared domain types
- **packages/utils/** – Cross-application utilities
- **scripts/** – One-off DB maintenance scripts (run with tsx; type-checked and linted)

Key design patterns:

- Date-seeded movie selection (daily/weekly/monthly) with deterministic hash-based randomization, persisted in `movie_selections`
- Multilingual support through the `translations` table
- Awards / nominations tracking (organizations → ceremonies → categories → nominations)
- UUID primary keys; camelCase in schema mapped to snake_case in the database (`casing: 'snake_case'`)
- Soft delete on movies via `deleted_at` — every movie lookup (API and scrapers) must filter or skip soft-deleted rows

## Common Commands

```bash
pnpm run dev              # API + front dev servers
pnpm run api:dev          # API only (wrangler, loads .dev.vars)
pnpm run front:dev        # front only

# Scrapers (CLI, run locally)
pnpm run scrapers:academy-awards
pnpm run scrapers:cannes-film-festival [--year YYYY] [--winners-only]
pnpm run scrapers:japanese-translations
pnpm run scrapers:japan-academy-awards [--year YYYY] [--dry-run] [--seed]
pnpm run scrapers:movie-import
pnpm run scrapers:availability-check

# Database (dev / prod)
pnpm run db:studio / db:generate / db:migrate / db:push
pnpm run db:studio:prod / db:generate:prod / db:migrate:prod / db:push:prod

# Quality gates — run before every commit
pnpm lint:fix && pnpm check   # eslint --fix + prettier --write, then lint + tsc build
pnpm run test                 # vitest (node + jsdom projects)
pnpm run test:api / test:front / test:scrapers / test:database

# Deploy (production only — dev environment is not used)
pnpm run api:deploy:prod
pnpm run front:deploy:prod

# API docs
pnpm run docs:validate   # redocly lint apps/api/openapi.yml (keep it green)
pnpm run docs:serve
```

## Database Schema

```
movies ←→ translations (movie titles/descriptions)
  ↓ 1:N     ↓ 1:N
nominations  movie_selections (daily/weekly/monthly picks)
  ↓ N:1         ↓ 1:N
award_categories  poster_urls, reference_urls, article_links,
  ↓ N:1           movie_availability_checks
award_organizations → award_ceremonies
```

Important schema rules:

- All tables use UUID primary keys via `generateUUID()`
- **`translations`**: `resourceType` is an enum of `'movie_title' | 'movie_description'`; `content` holds the raw text (never `"title:..."` prefixed). Composite unique on `(resourceType, resourceUid, languageCode)`. Movie titles live ONLY here, not on `movies`
- `movies.deletedAt` implements soft delete; unique constraints on `imdbId`/`tmdbId` still include deleted rows, so dedup checks must NOT filter them out (skip instead of re-creating)
- Schema fields are camelCase (`createdAt`) but map to snake_case columns; always reference schema fields in queries, never hardcoded column names

## Environment Configuration

Local development reads `.dev.vars` at the repo root (loaded by `scripts/setup-database-environment.cjs` and `apps/scrapers/src/common/environment.ts`):

- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
- `ADMIN_PASSWORD`, `JWT_SECRET` (admin auth; JWT expires after 7 days)
- `TMDB_API_KEY`, `TMDB_LEAD_ACCESS_TOKEN`, `OMDB_API_KEY`
- `TURNSTILE_SECRET_KEY` / `PUBLIC_TURNSTILE_SITE_KEY`

Cloudflare Workers: non-secret vars go in `wrangler.jsonc`/`wrangler.toml` `vars`; secrets via `wrangler secret put`. React Router v7 reads env via loader context (`resolveApiUrl(context)` in `apps/front/app/lib/api.ts`).

## API Design

- `GET /` – date-seeded selections (daily / weekly starting Friday / monthly), locale-aware
- `GET /movies/:id` – movie details with translations
- `POST /auth/login` – admin login (rate-limited per IP)
- `POST /fetch-url-title` – URL title fetch (SSRF-guarded via `utils/url-safety.ts`)
- `/admin/*` – JWT-protected admin CRUD (movies, ceremonies, nominations, posters, translations, TMDb sync, selection overrides). See `apps/api/openapi.yml` for the full list — keep it in sync with implementations
- Edge caching via `EdgeCache` (`apps/api/src/utils/cache.ts`): cache keys include locale; writes use `set()`, reads use `get()`. When invalidating movie caches use `getMovieCacheKeysForAllLocales()`

## Frontend (React Router v7)

- Public: `/` (selections), `/movies/:id`, `/search`, sitemaps, OG images (`/og/*`)
- Admin (localStorage JWT): `/admin/login`, `/admin/movies`, `/admin/movies/:id`, `/admin/movies/selections`, `/admin/ceremonies`, `/admin/ceremonies/:uid`
- API URL resolution: always `resolveApiUrl(context)` from `@/lib/api` — never hand-cast `context.cloudflare`
- Tests: Vitest + React Testing Library, co-located `*.test.tsx`

## Code Style and Conventions

- TypeScript strict; ESLint flat config (js/ts recommended + unicorn + react-hooks) with `--max-warnings 0`; Prettier for formatting
- Run `pnpm lint:fix && pnpm check` before every commit
- No comments in code unless explicitly requested
- API URL convention: base URLs without trailing slash, paths start with `/`
- Follow existing patterns for DB queries (Drizzle) and API responses (Hono)

## Development Guidelines

- TSエラーとLintエラーを絶対に無視するな
- **Foreign keys / cascading deletes**: most tables lack `onDelete: 'cascade'`. Movie deletion order: article_links → movie_selections → nominations → reference_urls → translations → poster_urls → movies. When adding delete operations, grep the whole schema for FK references first
- **Soft delete**: scrapers must skip soft-deleted movies when attaching data (see `isNull(movies.deletedAt)` filters and skip guards); do not "resurrect" them
- **TMDb integration**: use the utilities in `apps/scrapers/src/common/tmdb-utilities.ts`; don't re-implement search/save logic per scraper
- **Scraper CLIs**: load env via `loadScraperEnvironment()` / `loadEnvironmentFiles()` from `common/environment.ts` (never `config({path: '../.dev.vars'})` — cwd-relative paths escape the repo root); always check `Response.ok` when calling worker-style handlers from CLIs
- **Rate limiting / security**: public submission endpoints need rate limiting; external URL fetches must go through `validateExternalUrl()`
- **Wikipedia scraping**: use duplicate-prevention `Set`s, multiple year-detection patterns, and handle text-format special cases (e.g. 2024 Japan Academy Awards)
- **Favicon**: `apps/front/public/favicon.svg` is the master; `favicon.ico` and `apple-touch-icon.png` are rasterized from it
- **Testing DB code**: prefer real libsql `file:` databases with `migrate()` over deep drizzle mocks
