# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHINE is a comprehensive movie database project designed to be the world's most organized movie database. It collects and organizes movie information, awards, nominations, and multilingual translations. The project is built on Cloudflare Workers with Turso (libSQL) database.

## Architecture

Key design patterns:

- Date-seeded movie selection (daily/weekly/monthly) with deterministic hash-based randomization, persisted in `movie_selections`
- Multilingual support through the `translations` table
- Awards / nominations tracking (organizations → ceremonies → categories → nominations)
- Credits (people → movie_credits) from TMDb; `/people/:id` で人物から映画を辿れる
- UUID primary keys; camelCase in schema mapped to snake_case in the database (`casing: 'snake_case'`)
- Soft delete on movies via `deleted_at` — every movie lookup (API and scrapers) must filter or skip soft-deleted rows

## Common Commands

```bash
# Quality gates — run before every commit
pnpm lint:fix && pnpm check   # eslint --fix + prettier --write, then lint + tsc build
pnpm run test                 # vitest (node + jsdom projects)
pnpm run test:api / test:front / test:scrapers / test:database

# Deploy (production only — dev environment is not used)
pnpm run api:deploy:prod
pnpm run front:deploy:prod
```

## Database Schema

Important schema rules:

- All tables use UUID primary keys via `generateUUID()`
- **`translations`**: `resourceType` is an enum of `'movie_title' | 'movie_description'`; `content` holds the raw text (never `"title:..."` prefixed). Composite unique on `(resourceType, resourceUid, languageCode)`. Movie titles live ONLY here, not on `movies`
- `movies.deletedAt` implements soft delete; unique constraints on `imdbId`/`tmdbId` still include deleted rows, so dedup checks must NOT filter them out (skip instead of re-creating)
- **`people` / `movie_credits`**: 監督・出演者。`people.tmdbId` と `movie_credits.creditId`（TMDbの`credit_id`）が一意キー。日本人は `people.name` が日本語表記、外国人は `translations` の `person_name` に日本語名が入る二系統なので、表示・検索は両方を見る
- Schema fields are camelCase (`createdAt`) but map to snake_case columns; always reference schema fields in queries, never hardcoded column names

## Environment Configuration

Local development reads `.dev.vars` at the repo root (loaded by `scripts/setup-database-environment.cjs` and `apps/scrapers/src/common/environment.ts`):

- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
- `ADMIN_PASSWORD`, `JWT_SECRET` (admin auth; JWT expires after 7 days)
- `TMDB_API_KEY`, `TMDB_LEAD_ACCESS_TOKEN`, `OMDB_API_KEY`
- `TURNSTILE_SECRET_KEY` / `PUBLIC_TURNSTILE_SITE_KEY`

Cloudflare Workers: non-secret vars go in `wrangler.jsonc`/`wrangler.toml` `vars`; secrets via `wrangler secret put`. React Router v7 reads env via loader context (`resolveApiUrl(context)` in `apps/front/app/lib/api.ts`).

## API Design

- `apps/api/openapi.yml` documents the full endpoint list — keep it in sync with implementations (`pnpm run docs:validate` must stay green)
- Edge caching via `EdgeCache` (`apps/api/src/utils/cache.ts`): cache keys include locale; writes use `set()`, reads use `get()`. When invalidating movie caches use `getMovieCacheKeysForAllLocales()`

## Frontend (React Router v7)

- Admin pages authenticate with a JWT held in localStorage
- API URL resolution: always `resolveApiUrl(context)` from `@/lib/api` — never hand-cast `context.cloudflare`
- Tests: Vitest + React Testing Library, co-located `*.test.tsx`
- **Masthead のナビ**: 項目は `NAV_LINKS` に足す。ボタンの行は `flex-wrap` 前提で、横並び固定にすると狭い画面で必ずはみ出す（過去2回のデグレ原因）
- **横幅のはみ出し確認**: 共通レイアウトやヘッダを触ったら `agent-browser set viewport 375 812` の後、各ページで `document.documentElement.scrollWidth <= clientWidth` を確認する（jsdomはレイアウトを持たないのでvitestでは検出できない）

## Code Style and Conventions

- Run `pnpm lint:fix && pnpm check` before every commit
- No comments in code unless explicitly requested
- API URL convention: base URLs without trailing slash, paths start with `/`

## Development Guidelines

- TSエラーとLintエラーを絶対に無視するな
- **Foreign keys / cascading deletes**: most tables lack `onDelete: 'cascade'`. Movie deletion order: article_links → movie_credits → movie_availability_checks → movie_selections → nominations → reference_urls → translations → poster_urls → movies. When adding delete operations, grep the whole schema for FK references first
- **Scrapers**: `apps/scrapers/` 配下を編集する前に `new-scraper` スキルを読む（env読み込み・soft-deleteスキップ・TMDbユーティリティ・Wikipedia重複防止・dry-run・冪等性の必須パターン）
- **Rate limiting / security**: public submission endpoints need rate limiting; external URL fetches must go through `validateExternalUrl()`
- **Favicon**: `apps/front/public/favicon.svg` is the master; `favicon.ico` and `apple-touch-icon.png` are rasterized from it
- **Testing DB code**: prefer real libsql `file:` databases with `migrate()` over deep drizzle mocks
