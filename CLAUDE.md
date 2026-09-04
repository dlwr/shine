# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHINE is a comprehensive movie database project designed to be the world's most organized movie database. It collects and organizes movie information, awards, nominations, and multilingual translations. The project is built on Cloudflare Workers with Turso (libSQL) database.

## 価値と北極星（2026-09-04）

SHINE の価値は 3 つ。(1) 観たいときに観る映画が自動で決まる、(2) 同じ映画を同じ月に観る人がいる共時性、(3) 知られていない映画が個人とコミュニティに再発見される。主役は「今月の1本」で、日替わり・週替わりはその受け皿。施策は「北極星を動かすか」で分けて提案する

- **北極星**: 今月の映画に他人が投稿した関連リンク（`article_links`）の数。本人（Scrapbox への鑑賞ノート）の投稿は数えない。「見た人の数」とは呼ばない
- **先行指標**: Cloudflare Web Analytics で国=Japan に絞った、今月の映画ページの訪問数
- **判断の締め切り**: 2026-12 末。目標は「他人のリンクが 1 件でも付いた月が 1 つ」。0 のとき、訪問数が 10 月比で伸びていれば投稿のハードル（書く・戻って貼る）を下げ、伸びていなければ導線と SNS を直す。両方伸びていれば続行
- **動かす施策**: ホームを月替わり中心に組み替えて視聴手段・投稿済みリンク・投稿導線を第一画面に出し「毎月1本、みんなで同じ映画を観る」と書く、映画ページの関連記事欄を視聴手段の直下へ、bot に月替わり枠（1 日の告知・15 日の再告知・月末のリンクまとめと予告）と日替わり本文末尾の導線、`/quiz` の結果に今月の1本への導線、関連リンクの文言を「記事」前提から「その映画について書いたものなら SNS のポストでも」に変える（API に制限はない）
- **保守**: 賞シーズンの速報と誤紐付けの修正。新しい賞は足さない
- **保留**: オープンデータ公開・技術記事、視聴可否の全件バックフィル（選出作は cron が再抽選済み）、`/watched` の称号・ベストテン全体、月ごとの専用ページ

## Architecture

Key design patterns:

- Date-seeded movie selection (daily/weekly/monthly) with deterministic hash-based randomization, persisted in `movie_selections`
- Multilingual support through the `translations` table
- Awards / nominations tracking (organizations → ceremonies → categories → nominations)
- Credits (people → movie_credits) from TMDb; `/people/:id` で人物から映画を辿れる
- 個人賞は `nominations.personUid` で人物に紐づく。人物の同定は「その映画のクレジット名との照合」で行い、旧字体・異体字は `common/japanese-name.ts` で寄せる
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
- **`nominations.personUid`**: 個人賞（監督賞・演技賞）は人物に紐づく。作品賞は `person_uid IS NULL` の部分ユニークインデックス、個人賞は人物を含む部分ユニークインデックスで一意性を担保しているので、作品側のクエリには `person_uid IS NULL` を付ける。作品賞の賞ページは `awardPageDefinitions`、個人賞の賞ページと `/people` のランキングは `personAwardDefinitions`（`awards-service.ts`）で定義する。`/years`・crossings・uncrowned は `awardPageNominations()` で作品賞に絞ること。映画祭のグランプリ・審査員賞は `subAward: true` で定義し、この集計からは除く（`findTopAwardPageDefinition`）
- **`people` / `movie_credits`**: 監督・出演者。`people.tmdbId` と `movie_credits.creditId`（TMDbの`credit_id`）が一意キー。日本人は `people.name` が日本語表記、外国人は `translations` の `person_name` に日本語名が入る二系統なので、表示・検索は両方を見る
- Schema fields are camelCase (`createdAt`) but map to snake_case columns; always reference schema fields in queries, never hardcoded column names
- **索引**: 外部キー列にはその列を先頭にした部分条件なしの索引を必ず置く（`foreign-key-indexes.test.ts` が検査する）。一意索引を `.where(...)` の部分索引に変えるときも先頭列の単独索引を残すこと。部分索引は WHERE の条件を含むクエリにしか使われず、#358 で `nominations.movie_uid` の索引が消えて `searchMovies` が映画ごとに全件走査になり、Turso の読み取りが 600 倍になった
- 映画ごとに評価される相関サブクエリを持つクエリは、`movie-search-query-plan.test.ts` のように `EXPLAIN QUERY PLAN` で CORRELATED の下に SCAN が無いことをテストで固定する。公開の読み取り経路を足したら `public-read-query-plan.test.ts` の `exercises` にも足す（発行された SQL を全部拾って実行計画を検査する。詳細ページは `indexOnly`）。本番は `ANALYZE` を流していないので実行計画はスキーマだけで決まり、ローカルの空 DB と一致する。本番で `ANALYZE` を流すとこの前提が崩れる

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
- **Turso の読み取り量**: 課金はスキャン行数。`turso db inspect shine --queries` で重いクエリを、`pnpm scrapers:turso-usage-alert --dry-run` で直近 24 時間と月累計を確認できる。GitHub Actions が 6 時間ごとに同じ確認をして Discord に警告する。overage は無効なので月の上限に達すると読み取りが止まる
- **Favicon**: `apps/front/public/favicon.svg` is the master; `favicon.ico` and `apple-touch-icon.png` are rasterized from it
- **Testing DB code**: prefer real libsql `file:` databases with `migrate()` over deep drizzle mocks
