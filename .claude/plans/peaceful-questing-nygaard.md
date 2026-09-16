# Admin ナビゲーション共通化

## Context

Admin ページ（`/admin/ceremonies`, `/admin/ceremonies/:uid` など）にトップページや Admin トップ（映画一覧）へ戻る動線がない。各ページでナビゲーションボタンがバラバラに実装されており、ページによっては重要なリンクが欠けている。

### 現状の問題

| ページ                    | トップ | 映画管理 | セレモニー | Selections | ログアウト |
| ------------------------- | ------ | -------- | ---------- | ---------- | ---------- |
| `admin.movies`            | ✅     | (自分)   | ✅         | ✅         | ✅         |
| `admin.movies.$id`        | ✅     | ✅       | ❌         | ❌         | ✅         |
| `admin.movies.selections` | ✅     | ✅       | ❌         | (自分)     | ✅         |
| `admin.ceremonies`        | ❌     | ❌       | (自分)     | ❌         | ✅         |
| `admin.ceremonies.$uid`   | ❌     | ❌       | ✅         | ❌         | ❌         |

## Approach

共通の `AdminNav` コンポーネントを1つ作り、全 admin ページのヘッダーに配置する。各ページごとの個別ナビボタンを置き換える。

## 実装手順

### Step 1: `AdminNav` コンポーネントを作成

**新規ファイル**: `apps/front/app/components/admin-nav.tsx`

- Props: なし（現在のパスは `useLocation()` で取得）
- リンク一覧:
  - `トップページ` → `/` (emerald)
  - `映画管理` → `/admin/movies`
  - `セレモニー管理` → `/admin/ceremonies`
  - `Movie Selections` → `/admin/movies/selections`
  - `ログアウト` ボタン (destructive)
- 現在のページに該当するリンクはアクティブスタイル（例: `variant="default"` や太字下線など）を適用
- `handleLogout` ロジックもこのコンポーネント内に含める
- 既存の `Button` コンポーネント（`@/components/ui/button`）を再利用

### Step 2: 各 admin ページに `AdminNav` を組み込む

以下のファイルを修正:

1. **`apps/front/app/routes/admin.movies.tsx`** (~L596-619)
   - ヘッダー部分のナビボタン群を `<AdminNav />` に置換
   - `handleLogout` 関数を削除

2. **`apps/front/app/routes/admin.movies.$id.tsx`** (~L160-175, L204-221)
   - loading 状態とメイン状態の両方のヘッダーを修正
   - 個別のナビボタン群を `<AdminNav />` に置換
   - `handleLogout` 関数を削除

3. **`apps/front/app/routes/admin.movies.selections.tsx`** (~L368-380)
   - ヘッダー部分のナビボタン群を `<AdminNav />` に置換
   - `handleLogout` 関数を削除

4. **`apps/front/app/routes/admin.ceremonies.tsx`** (~L225-236)
   - ヘッダー右側に `<AdminNav />` を追加
   - 既存のログアウトボタンを削除
   - `handleLogout` 関数を削除

5. **`apps/front/app/routes/admin.ceremonies.$uid.tsx`** (~L1094-1097)
   - 「一覧に戻る」ボタンはページ固有のためそのまま残す
   - `<AdminNav />` を追加してトップページ・映画管理・ログアウトへの動線を確保

### Step 3: TDD - テスト

- 各既存テストが引き続きパスすることを確認
- `pnpm run test:front` を実行

### Step 4: Lint & Type Check

- `pnpm lint:fix && pnpm check`

## 修正対象ファイル

- `apps/front/app/components/admin-nav.tsx` (新規)
- `apps/front/app/routes/admin.movies.tsx`
- `apps/front/app/routes/admin.movies.$id.tsx`
- `apps/front/app/routes/admin.movies.selections.tsx`
- `apps/front/app/routes/admin.ceremonies.tsx`
- `apps/front/app/routes/admin.ceremonies.$uid.tsx`

## 再利用する既存コード

- `Button` コンポーネント: `apps/front/app/components/ui/button.tsx`
- `useLocation` from `react-router`

## 検証方法

1. `pnpm run test:front` で全テストがパス
2. `pnpm lint:fix && pnpm check` でエラーなし
3. `pnpm run front:dev` でローカル確認:
   - 全 admin ページに一貫したナビゲーションが表示される
   - 現在のページが視覚的に分かる
   - 各リンクが正しく遷移する
   - ログアウトが動作する
