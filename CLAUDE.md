# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHINE is a comprehensive movie database project designed to be the world's most organized movie database. It collects and organizes movie information, awards, nominations, and multilingual translations. The project is built on Cloudflare Workers with Cloudflare D1 (`shine-main`, moved from Turso on 2026-09-25).

## 価値と北極星（2026-10-27 に変更）

SHINE の価値は 3 つ。(1) 観たいときに観る映画が自動で決まる、(2) 同じ映画を同じ月に観る人がいる共時性、(3) 知られていない映画が個人とコミュニティに再発見される。北極星は優先度を付ける物差しの 1 つで、北極星に効かないことを候補から外す理由にしない

- **北極星**: 外から来た人がサイト内で次のページを開いた回数（週）。Cloudflare Web Analytics で国=Japan・bot と `/admin` を除き、リファラが shine-film.com の PV を数える。admin にログインしたことのある端末は beacon を読み込まないので本人は載らない（`lib/web-analytics.ts`）
- **なぜ変えたか**: 旧北極星「今月の1本に他人が付けたリンク」は 2026-08〜10 の 3 か月とも 0。外からの訪問が週約 26（ほぼ Bing 検索、着地は人物・賞ページ）では共時性の指標は動かないので、まず来た人に 2 ページ目を読ませる段階とした。旧北極星は補助指標として残す
- **基準と目標**: 2026-10-27 の週で約 10（本人の Android を除いた推定）。2026-12 末に週 30
- **数え方**: `pnpm scrapers north-star-report`（毎週月曜に GitHub Actions が Discord へ投稿する。survey にも出る）。補助指標の他人のリンクは、URL が `https://scrapbox.io/yuta25/` で始まる投稿を本人、ループバック IP をテストとして除き、前月20日の予告（00:00 JST）以降の分を数える
- **動かす施策**: 検索の着地先（人物・賞・映画ページ）から次の1本へ進む導線、検索で当たっている賞ページを厚くする、二本立てのような回遊したくなる切り口。今月の1本の仕組み（ホームの帯・bot の月替わり枠・関連リンク欄）は残す
- **北極星の外でもやる**: 価値 (1)(3) に効く機能（再発見の切り口・一覧・おすすめ）、見た目と体験の刷新、それ以外の作って面白いもの
- **保守**: 賞シーズンの速報と誤紐付けの修正。新しい賞は足さない
- **保留**: オープンデータ公開・技術記事、視聴可否の全件バックフィル（選出作は cron が再抽選済み）、`/watched` の称号・ベストテン全体、月ごとの専用ページ
- **やらない**: インデックス促進・SEO の施策（2026-07〜08 に出し切った。2026-09-04 からの Google の落ち込みは量産した薄いページへのサイト単位の品質評価で、技術面の直しでは戻らない）、`/search` の robots の Disallow を外す、サービス名のリブランド（#420 で見送り）、邦題・ポスターの補完（天井）、TMDb への邦題・あらすじの一括投稿、TMDb キャストの上限（上位 10 名）を上げる、admin 認証の httpOnly Cookie 化、availability-check の定刻実行
- **索引の線**: 映画は「日本語あらすじがある、またはノミネート 2 件以上」、人物は「個人賞のノミネートがある」だけを索引に入れ、それ以外は `noindex, follow` で sitemap から外す。線は API（`movies-service.ts`・`people-ranking.ts`）と front（`movie-detail-meta.ts`・`people.$id.tsx`）の 2 か所ずつにあるので、変えるときは両方
- **入口を数えるとき**: RUM（Web Analytics）は国=Japan・bot 除外で、`refererHost`・`userAgentOS`・`date` で割る。`/admin` を開いている端末のセッションは本人なので除く。7 日より前の窓は 10 単位のサンプル推定に落ちる（値が全部 10 の倍数ならサンプル）ので、窓は取得時刻から 7 日以内にして `date` で割って足す

## 見た目と設計判断

- **見た目は「名画座の番組表」**（2026-09-28 に本人が選んだ）。既定は臙脂がかった暗い場内で OS 設定に追従しない。明るいテーマは水色の色上質紙に藍。見出し・題名・年は端末の明朝（Web フォントなし）、本文とラベルは端末のゴシック。朱は角印の意匠（ホームの「上映中」、受賞バッジの枠、帯の「今月の1本」）だけで、塗りつぶしには使わない。ラベルは日本語の見出しにし、英大文字・リンク末尾の → は使わない。太枠・ずらし影・等幅は使わない
- 新しい切り口はなるべく既存のページの節として足す（2026-10-28 に本人が「ゴテゴテしてきた」と言った）。`/crossings` `/uncrowned` `/people/crossings` への導線は `/awards` `/people` から張り、Masthead には足さない
- `/years` の軸は授賞式年でなく `movies.year`。`/people/crossings` の軸は部門でなく団体。`/people` のランキングと `/uncrowned` は `grouping: 'year'` の (組織, 部門) だけを数え、リスト型の賞は数えない
- 人物ページの受賞歴は年でなく作品を行にする（団体ごとに年の基準が違う）。日替わり選出はノミネーション数で重み付けするので、個人賞は除く
- workers.dev の Rate Limiting binding はこの account では上限が効かない（2026-09-25 に確認）。実際に効いているのは isolate ごとのメモリの Map と、ログインの失敗回数だけ
- オーナーは SNS の運用が苦手と言っている。アカウントを育てる系の施策は、こちらから具体案を出す

## 進め方

- 迷ったら止まって質問せず、仮定を置いて最後まで進め、置いた仮定を最終報告に短く並べる。確認を取るのは不可逆な操作だけ
- 完了はコミット（意味単位で分割）→ push → PR → CI が落ちたら直して push し直す、まで。CI が緑の自作の PR は確認なしでマージしてよい（main へのマージで本番に自動デプロイされる。dev 環境は使わない）
- ターンを終えるのは「完了した」「自分では進められない」「不可逆操作の確認が要る」のどれかだけ。「次は〜します」と書いて終えない、「続けますか？」と聞かない
- 本人名義で外に出るもの（SNS の投稿・リプライ・DM）の送信ボタンは押さない。文面を整えて投稿画面に入れるまでで渡す。TMDb へのポスター画像の投稿だけは許可済み
- PR の本文は Summary / Test Plan のような定型にせず、何をしたかを簡潔に書く。コミットメッセージと PR 本文にセッションの URL を付けない
- 実装計画・設計スペックなどの作業ドキュメントはコミットせず `tmp/` に置く
- 名前に `active` を使わない（何の状態かを具体的に名前にする）
- 応答は結論だけ短く。意見を求められたら忖度せず率直に言う
- 「なんかやろう」と言われたら `nanka-yarou` スキル（`.claude/skills/nanka-yarou/`）に従う

## Architecture

Key design patterns:

- Date-seeded movie selection (daily/weekly/monthly) with deterministic hash-based randomization, persisted in `movie_selections`
- Multilingual support through the `translations` table
- Awards / nominations tracking (organizations → ceremonies → categories → nominations)
- Credits (people → movie_credits) from TMDb; `/people/:id` で人物から映画を辿れる
- 個人賞は `nominations.personUid` で人物に紐づく。人物の同定は「その映画のクレジット名との照合」で行い、旧字体・異体字は `common/japanese-name.ts` で寄せる
- UUID primary keys; camelCase in schema mapped to snake_case in the database (`casing: 'snake_case'`)
- Soft delete on movies via `deleted_at` — every movie lookup (API and scrapers) must filter or skip soft-deleted rows
- 「日本で観られるか」の判定は `apps/api/src/services/japan-availability.ts` の 1 か所（source ごとの最新の確認で ok があれば観られる、DISCAS だけ ok は別作品の混入があるので「宅配レンタルのみ（要確認）」、ng があれば観られない、それ以外は未確認）。賞ページ・年別ページの `availabilitySummary` と `/awards/:slug/unavailable` はこれで数える

## Common Commands

```bash
# Quality gates — run before every commit
pnpm lint:fix && pnpm check   # eslint --fix + prettier --write, then lint + tsc build
pnpm run test                 # vitest (node + jsdom projects)
pnpm knip                     # unused files, exports and dependencies (CI runs it; add one-off scripts to knip.json entry)
pnpm run test:api / test:front / test:scrapers / test:database

# Deploy (production only — dev environment is not used)
pnpm run api:deploy:prod
pnpm run front:deploy:prod
pnpm run og:deploy:prod       # OG images worker (shine-og)
```

## Database Schema

Important schema rules:

- All tables use UUID primary keys via `generateUUID()`
- **`translations`**: `resourceType` is an enum of `'movie_title' | 'movie_description'`; `content` holds the raw text (never `"title:..."` prefixed). Composite unique on `(resourceType, resourceUid, languageCode)`. Movie titles live ONLY here, not on `movies`
- `movies.deletedAt` implements soft delete; unique constraints on `imdbId`/`tmdbId` still include deleted rows, so dedup checks must NOT filter them out (skip instead of re-creating)
- **`nominations.personUid`**: 個人賞（監督賞・演技賞）は人物に紐づく。作品賞は `person_uid IS NULL` の部分ユニークインデックス、個人賞は人物を含む部分ユニークインデックスで一意性を担保しているので、作品側のクエリには `person_uid IS NULL` を付ける。作品賞の賞ページは `awardPageDefinitions`、個人賞の賞ページと `/people` のランキングは `personAwardDefinitions` で定義する（`award-definitions.ts` が `award-definitions/` の映画祭・年次賞・リストごとのファイルを結合する。組織の DB 名と日本語名は `award-definitions/organizations.ts` の定数を使う。ロジックは作品賞が `awards-service.ts`、個人賞が `person-awards-service.ts`、両者が使うカテゴリの解決と賞の要約が `award-category-queries.ts`。映画の題名の列は `movie-title-columns.ts` の `movieTitleColumns()`（ja と既定の 2 列）と `localizedMovieTitle(locale)`（ロケール→既定→en の 1 列）を使う）。`/years` は `awardPageNominations()` で作品賞に絞ること。映画祭のグランプリ・審査員賞は `subAward: true` で定義し、この集計からは除く（`findTopAwardPageDefinition`）
- **`people` / `movie_credits`**: 監督・出演者。`people.tmdbId` と `movie_credits.creditId`（TMDbの`credit_id`）が一意キー。日本人は `people.name` が日本語表記、外国人は `translations` の `person_name` に日本語名が入る二系統なので、表示・検索は両方を見る
- Schema fields are camelCase (`createdAt`) but map to snake_case columns; always reference schema fields in queries, never hardcoded column names
- **索引**: 外部キー列にはその列を先頭にした部分条件なしの索引を必ず置く（`foreign-key-indexes.test.ts` が検査する）。一意索引を `.where(...)` の部分索引に変えるときも先頭列の単独索引を残すこと。部分索引は WHERE の条件を含むクエリにしか使われず、#358 で `nominations.movie_uid` の索引が消えて `searchMovies` が映画ごとに全件走査になり、当時の Turso の読み取りが 600 倍になった
- 映画ごとに評価される相関サブクエリを持つクエリは、`movie-search-query-plan.test.ts` のように `EXPLAIN QUERY PLAN` で CORRELATED の下に SCAN が無いことをテストで固定する。公開の読み取り経路を足したら `public-read-query-plan.test.ts` の `exercises` にも足す（発行された SQL を全部拾って実行計画を検査する。詳細ページは `indexOnly`）。この 2 本はローカルの D1（`createD1TestDatabase`）で EXPLAIN する。本番は `ANALYZE` を流していないので実行計画はスキーマだけで決まり、ローカルの空 D1 と一致する。本番で `ANALYZE` を流すとこの前提が崩れる
- **検索索引**: 人物名（`people.name` と `person_name`）と映画題名（`movie_title`）は FTS5 の `person_search` / `movie_search` に文字 bigram で入り、`people`・`translations` のトリガーが `*_search_entries`（元の行の uid → FTS の rowid）を介して同期する（マイグレーション 0028。スキーマ TS には無い）。名前・題名の一致は `search-terms.ts` を通す（2 文字以上は MATCH、1 文字は LIKE）。FTS5 の UNINDEXED 列での削除は全件走査になるので、トリガーは対応表の索引で rowid を引く形を崩さない。drizzle-kit が `people` / `translations` を作り直すマイグレーション（`__new_*` への複製と DROP TABLE）を出すとトリガーが消えるので、同じマイグレーションで張り直す。`db:push` は使わない

## Environment Configuration

Local development reads `.dev.vars` at the repo root (loaded by `scripts/setup-database-environment.cjs` and `apps/scrapers/src/common/environment.ts`):

- `D1_PROXY_URL` / `D1_PROXY_KEY`（scrapers・手元の API 開発・GitHub Actions は D1 に proxy の worker `shine-database-proxy` 経由で繋ぐ。本番の API は binding `DB`）
- `DATABASE_FILE_URL`（`file:...` を渡すとそのローカルの SQLite を proxy より優先して使う。テストと手元の試し用）
- `ADMIN_PASSWORD`, `JWT_SECRET` (admin auth; JWT expires after 7 days)
- `TMDB_API_KEY`, `TMDB_LEAD_ACCESS_TOKEN`, `OMDB_API_KEY`
- `TURNSTILE_SECRET_KEY` / `PUBLIC_TURNSTILE_SITE_KEY`

Cloudflare Workers: non-secret vars go in `wrangler.jsonc`/`wrangler.toml` `vars`; secrets via `wrangler secret put`. React Router v7 reads env via loader context (`resolveApiUrl(context)` in `apps/front/app/lib/api.ts`).

## API Design

- Edge caching via `EdgeCache` (`apps/api/src/utils/cache.ts`, KV only: `new EdgeCache(c.env.CACHE_KV)`): cache keys include locale; writes use `set()`, reads use `get()`. After movie mutations call `invalidateMovieCaches()`. 映画詳細（`GET /movies/:id`）は KV に載せず D1 から返す（冷えた KV の読みが APAC の D1 より遅いため）
- 取り込みでしか変わらない 7 日 TTL の経路は `readThroughCache`（`apps/api/src/utils/read-through-cache.ts`）で読む。期限を過ぎた値はそのまま返して応答の後で作り直し（`X-Cache-Status: STALE`）、KV には TTL より 30 日長く残す。ルートの外（`QuizService` の出題プール）で使うときは service のコンストラクタに `c` を渡す（無ければ書き込みを待つ）。鍵に利用者入力が入る経路（`/people/search` など）には使わない（鍵空間が入力しだいで膨らむ）。反映を急ぐときは従来どおり鍵を消す
- **キャッシュ鍵の版**は `cache-key-version.test.ts` が固定する。公開経路が KV に書く中身の鍵の並びを `cache-payload-shapes.json` に記録してあり、応答の形が変わったのに鍵の版（`:v9` など）が同じだと落ちる。版を上げたら `UPDATE_CACHE_SHAPES=1 pnpm vitest run --project node apps/api/src/__tests__/cache-key-version.test.ts` で記録し直す（版を上げずに記録だけ更新することはできない）。テストデータ（`public-data-seed.ts`）を変えて形が変わっただけのときは、記録から該当の鍵を消してから記録し直す

## Frontend (React Router v7)

- Admin pages authenticate with a JWT held in localStorage
- API URL resolution: always `resolveApiUrl(context)` from `@/lib/api` — never hand-cast `context.cloudflare`
- Tests: Vitest + React Testing Library, co-located `*.test.tsx`
- **OG 画像**は別 worker `shine-og`（入口 `workers/og.ts`、設定 `wrangler.og.jsonc`、描画は `app/og/`）。front の `workers/app.ts` が `/og/*.png` と `/quiz/poster.png` を service binding `OG` へ転送するので URL は front と同じ。front の起動を軽くするための分離なので、front 側から `app/og/` の描画コードや `workers-og` を import しない（`front-imports.test.ts`）。パスを足すときは `app/og/paths.ts` と `router.ts` の両方に足す。ローカルは `pnpm og:dev`（`pnpm front:dev` では OG 画像は出ない）。`QUIZ_ANSWER_KEY` は API と `shine-og` の secret
- **Masthead のナビ**: 項目は `NAV_LINKS` に足す。ボタンの行は `flex-wrap` 前提で、横並び固定にすると狭い画面で必ずはみ出す（過去2回のデグレ原因）
- **VRT**（`apps/front/vrt/`）: seed を入れたローカル D1 に向けた API と front を時計を 2026-09-15 12:00 JST に固定して起動し、主要ページのスクショ比較（375/1280）と 375px のはみ出し検査（`scrollWidth <= clientWidth`）を回す。PR で front・api・packages を触ると `.github/workflows/vrt.yml` が走る。基準の更新は、push して CI の VRT を落とし `pnpm --filter @shine/front vrt:pull`（CI が落ちたページだけ撮り直して artifact `vrt-snapshots` に置いたものを取ってくる。引数なしで今のブランチの最新の run）。手元で撮るなら `vrt:update`（Docker の Linux で撮る。mac で撮ると字形が変わるので `--update-snapshots` を手元で直に使わない）。手元の mac で回せるのははみ出し検査だけ（`pnpm --filter @shine/front vrt vrt/overflow.spec.ts`）。見るページは `vrt/pages.ts`、VRT だけのデータは `vrt/seed.ts` に足す。`@playwright/test` を上げたら `vrt.yml` の container の版も合わせる

## Code Style and Conventions

- Run `pnpm lint:fix && pnpm check` before every commit
- No comments in code unless explicitly requested
- API URL convention: base URLs without trailing slash, paths start with `/`

## Development Guidelines

- TSエラーとLintエラーを絶対に無視するな
- **Foreign keys / cascading deletes**: most tables lack `onDelete: 'cascade'`. Movie deletion order: article_links → movie_credits → movie_availability_checks → movie_selections → nominations → reference_urls → translations → poster_urls → movies. When adding delete operations, grep the whole schema for FK references first
- **Scrapers**: `apps/scrapers/` 配下を編集する前に `new-scraper` スキルを読む（env読み込み・soft-deleteスキップ・TMDbユーティリティ・Wikipedia重複防止・dry-run・冪等性の必須パターン）。CLI は `pnpm scrapers <command> [options]` の単一エントリ（`apps/scrapers/src/cli.ts`）で、各 `*-cli.ts` は `createCommand()` を export するだけでトップレベルの副作用を持たない（`cli.test.ts` が検査する）。一覧は `pnpm scrapers --help`（用途ごとに分類して出る）。既存データを書き換える・消す修復系（`fix-*`）は既定が dry-run で、書き込むときだけ `--apply` を付ける。本番のデータを確かめるときは `pnpm scrapers sql "<SELECT ...>"`（読み取り専用。一時スクリプトを置かない）
- **Rate limiting / security**: public submission endpoints need rate limiting; external URL fetches must go through `validateExternalUrl()`
- **D1 の制約**: 1 文の bind 変数は 100 個まで（長い IN は `inChunks`、複数行 insert・IN の delete は `runInChunks`、コードの定数は `stringLiteral`）。`transaction()` は使えない（読み取りを先に済ませて書き込みを `runBatch` にまとめる）。async 関数から drizzle のビルダを 1 つ返すと thenable なので実行されてしまう（文は配列で返す）。`IN (SELECT value FROM json_each(?))` は結合の中では索引を使わない
- **D1 の読み取り量**: 課金はスキャン行数で、上限なしで課金される（Workers Paid の込みは月 250 億行、書き込み 5,000 万行）。`pnpm scrapers d1-usage-alert --dry-run` で直近 1 時間・24 時間・月累計を確認でき、GitHub Actions が毎時同じ確認をして Discord に警告する。重いクエリは `pnpm scrapers survey` の D1 の節（直近 24 時間の上位 5 文）か `wrangler d1 insights shine-main`
- **マイグレーション**: `pnpm db:generate` で生成し、`pnpm scrapers database-migrate`（dry-run）→ `--apply` で proxy 経由で流す（`create-migration` スキル）。表を作り直すマイグレーションで D1 は `PRAGMA foreign_keys=OFF` が効かないので `PRAGMA defer_foreign_keys = on` を使う。マイグレーションは D1 に 0 から流せる状態を保つ（`d1-migrations.test.ts` が libsql と同じスキーマになることを検査する。libSQL 独自の `ALTER COLUMN` は使わない）
- **バックアップと移し替え**: `pnpm scrapers database-backup` は D1 を proxy 経由で読んで SQLite ファイルにする（週次の workflow が age で暗号化して artifact に置く）。SQLite ファイルから D1 へは `pnpm scrapers d1-import-sql` で SQL にして `wrangler d1 execute <DB> --remote --file` で流す（空の D1 に。約 1.5 分）
- **Favicon**: `apps/front/public/favicon.svg` is the master; `favicon.ico`（16/32/48）と `apple-touch-icon.png`（180）はそこから `rsvg-convert` → `magick` で焼き直す（`magick <png...> favicon.ico`、PNG は `-strip -define png:compression-level=9` を付けないと倍に膨らむ）。下地の色は `styles/tokens.css` の `--brand` と同じで、ずれると `styles/brand-color.test.ts` が落ちる（OG カードの `og/render/template.ts` も同じテストで縛っている）
- **Testing DB code**: prefer real libsql `file:` databases with `migrate()` over deep drizzle mocks. D1 固有の振る舞い（変数 100 個・transaction 不可）に関わる経路と実行計画のテストは `@shine/database/testing` の `createD1TestDatabase`（wrangler のローカル D1）で通す。ローカル D1 は 1 クエリ約 7ms・起動約 2 秒と libsql よりずっと遅いので、それ以外のテストを D1 に寄せない
