---
name: new-scraper
description: apps/scrapersに新しいスクレイパーCLIを追加するときの必須パターン。スクレイパーの新規作成・大幅改修時に読む
---

# 新規スクレイパーの作り方

既存の `apps/scrapers/src/cannes-palme-dor-cli.ts` + `cannes-palme-dor.ts` のペアを雛形にする。英題の完全一致で既存映画を探すと誤紐付けするので、同定は Wikidata の外部 ID を経由すること。

## 必須パターン

1. **環境変数**: コマンドの `.action()` の中で `loadEnvironmentFiles()` → `buildEnvironment(process.env)`（`common/environment.ts`）。モジュールのトップレベルでは呼ばない。`config({path: '../.dev.vars'})` のようなcwd相対パスは禁止
2. **CLI**: `<name>-cli.ts` は `export function createCommand(): Command` を持つだけのモジュールにする（トップレベルで `parse()` や `await` をしない）。`.name()` はサブコマンド名、`--year YYYY` / `--dry-run` 等のオプションは既存CLIの命名に合わせる。`src/cli.ts` の `commandGroups` のどれかに `createCommand` を追加すると `pnpm scrapers <name>` で呼べる（分類に入れないと `cli.test.ts` が落ちる）。package.json に scripts は足さない。ヘルプの例は `pnpm scrapers <name> ...` と書く。`__tests__/cli.test.ts` が全 `*-cli.ts` の登録と副作用の無さを検査する。英語版Wikipediaの受賞者一覧から読むものは `createEnWikipediaAwardCommand`、IMDbイベントの収集データを読むものは `createImdbEventAwardCommand`（`common/`）を `createCommand` から返す
3. **Soft delete**: moviesを参照するクエリには `isNull(movies.deletedAt)` を付ける。soft-deleted映画にはデータを付与せずスキップする（復活させない）。ただしimdbId/tmdbIdの重複チェックはdeleted行を含めて行い、重複時は再作成せずスキップする
4. **TMDb**: 検索・保存は `@shine/tmdb`（HTTP）と `@shine/tmdb/persistence`（DB への保存） を使う。スクレイパーごとに再実装しない
5. **重複防止**: Wikipediaスクレイピングでは重複防止の `Set` を使い、年検出は複数パターン用意する。テキスト形式の特殊ケース（2024年日本アカデミー賞など）に注意
6. **外部URL**: fetchする外部URLは `validateExternalUrl()` を通す。`Response.ok` を必ずチェックする
7. **タイトル保存**: 映画タイトルは `translations` テーブルのみ（resourceType: 'movie_title'）。contentに `title:` プレフィックスを付けない
8. **dry-run**: データベースは `getScrapeDatabase(context)`（`common/dry-run.ts`）で取る。dry-run中に `insert`/`update`/`delete` を呼ぶと例外になるので、書き込み経路の分岐漏れがテストで露見する。`context` に `isDryRun: boolean` を持たせること。既存データを書き換える・消す修復系は `common/write-mode.ts` の `applyOption()`・`dryRunOption()`・`isDryRun()` を使い、既定を dry-run にして `--apply` で書く
9. **冪等性**: 再実行でUNIQUE制約に当たらないこと。既存映画の照合はタイトルではなくIMDb IDを優先し、soft-deleted行に当たったら再作成せずスキップする（`academy-awards/import-movie.ts` の `findExistingMovie` が参考）

## 実行前の検証

全件実行の前に少数サンプルで実行し、保存内容をSQLで確認する（過去にNull 223件保存の事故あり）。実行後も件数と内容をSQLで検証する。

ローカルの一時DBで試せる。`TURSO_DATABASE_URL="file:/tmp/x.db"` を渡せば認証トークンは要らず、`.env` の `D1_PROXY_URL`（本番の D1）より優先される（`getDatabase` と `d1ProxyOf` が `file:` を特別扱いする）。マイグレーションは `migrate()` を呼ぶ小さい `.mts` をパッケージ内に置いて `npx tsx` で流す（スクラッチパッド直下だとモジュール解決に失敗する）。

## テスト

`apps/scrapers/src/**/__tests__/` に置く。DBを使うテストはdrizzleのモックではなくlibsqlの `file:` データベース + `migrate()` を使う。
