# mediaType（映画/TV）サポート追加

## Context

映画 `82446797-44fb-4e1f-b57b-f4444efcf3eb` はTVシリーズだが、現在のスキーマにはメディアタイプの区別がない。TMDb APIは映画(`/movie/{id}`)とTV(`/tv/{id}`)で異なるエンドポイントを使うため、正しいデータ取得のために区別が必要。

現在の`fetchTMDBDataByImdbId`は`movie_results`しか見ておらず、TVシリーズのIMDb IDを入れると「見つからない」扱いになる。

## 実装手順

### 1. スキーマ変更 + マイグレーション

**File:** `packages/database/src/schema/movies.ts`

- `mediaType` カラム追加: `text().notNull().default('movie')`
- 既存レコードは全て `'movie'` になる
- `pnpm run db:generate` → `pnpm run db:migrate`

### 2. TMDbユーティリティ更新

**File:** `apps/scrapers/src/common/tmdb-utilities.ts`

- `TMDBFindResponse` に `tv_results` 追加
- `TMDBTvData` 型追加（`name`, `original_name`, `first_air_date` 等）
- `findTMDBByImdbId` の戻り値を `number | undefined` → `{tmdbId: number; mediaType: 'movie' | 'tv'} | undefined` に変更
  - `movie_results` を優先、なければ `tv_results` をチェック
- `fetchTMDBTvDetails` 関数追加（`/tv/{id}` エンドポイント使用、フィールド名をmovieに正規化）
- `fetchTMDBDetails` ディスパッチャー追加（mediaTypeに応じて movie/tv 呼び分け）
- `fetchTMDBMovieImages`, `fetchTMDBMovieTranslations` に `mediaType` パラメータ追加
- 呼び出し元（3箇所）を新しい戻り値に対応

### 3. Admin Service更新

**File:** `apps/api/src/services/admin-service.ts`

- `fetchTMDBDataByImdbId` (L1162-1207):
  - `tv_results` もチェック、`mediaType` を返却に含める
  - TVの場合 `/tv/{id}?append_to_response=translations` を使用
- `updateIMDbId`: TMDbデータ取得時に `mediaType` もDBに保存
- `getMovieForAdmin`: selectに `mediaType` 追加

### 4. APIエンドポイント更新

**File:** `apps/api/src/routes/admin.ts`

- `auto-fetch-tmdb`, `refresh-tmdb` ルートで `mediaType` に基づいて正しいTMDbエンドポイント使用
- movie詳細APIレスポンスに `mediaType` 含める

### 5. フロントエンド更新

**Files:**

- `apps/front/app/components/movie-info-editor.tsx` - メディアタイプ表示（「映画」/「TV」）
- `apps/front/app/routes/admin.movies.tsx` - リスト画面でTVバッジ表示

表示のみ（読み取り専用）。TMDb find APIで自動判別されるので手動編集は不要。

### 6. インポートスクリプト更新

**File:** `apps/scrapers/src/import-imdb-list.ts`

- `insertMovieWithTranslations` で `mediaType` を永続化（既に `media_type` を検出しているが保存していない）

## コミット分割

1. スキーマ: `mediaType` カラム追加 + マイグレーション生成
2. TMDbユーティリティ: `findTMDBByImdbId` 戻り値変更、TV対応関数追加
3. Admin Service + APIルート: `mediaType` のスレッディング
4. インポートスクリプト: `mediaType` 永続化
5. フロントエンド: `mediaType` 表示

## 注意事項

- `findTMDBByImdbId` の戻り値変更は破壊的変更。呼び出し元3箇所を同時に更新する必要あり
- TMDb の `tmdbId` は映画とTVで別の名前空間。同じIDが両方に存在する可能性があるが、実用上は稀
- TV翻訳APIのレスポンスでは `data.title` ではなく `data.name` が使われる場合がある

## 検証方法

1. `pnpm run db:migrate` でマイグレーション適用
2. `pnpm lint:fix && pnpm check` で型チェック・lint通過確認
3. `pnpm run test:front` でフロントエンドテスト通過確認
4. Admin UIから既知のTVシリーズIMDb ID（例: `tt0903747` Breaking Bad）でIMDb更新 → `mediaType: 'tv'` が設定されることを確認
5. 該当映画 `82446797-44fb-4e1f-b57b-f4444efcf3eb` のIMDb IDでrefreshして正しくTV判定されることを確認
