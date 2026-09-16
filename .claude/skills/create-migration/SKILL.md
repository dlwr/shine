---
name: create-migration
description: Drizzleスキーマ変更のマイグレーションを生成し、本番へ適用する。packages/database/src/schema/ を変更するときに読む
---

# マイグレーション作成

1. `packages/database/src/schema/` のスキーマを変更する
2. `pnpm db:generate` で `packages/database/migrations/` にSQLを生成する
3. 生成されたSQLを必ず目視確認する（意図しないDROP・データ破壊がないか）
4. `pnpm test:database` を実行する
5. コミットは意味単位で分割する（マイグレーション追加とスキーマ変更で1コミット、利用側コードは別コミット）
6. **本番に適用する**（下記）
7. PRを作成し、CIが通ったらマージする

## 本番適用（忘れやすいので必ずやる）

`pnpm db:migrate:prod` を実行し、`turso` CLIか `pnpm db:studio:prod` で反映を確認する。
過去に適用忘れがあった（0014）。

**dev用のDBは無い。`.dev.vars` と `.env` の `TURSO_DATABASE_URL` は同じ本番DBを指すので、
`pnpm db:migrate` も本番に当たる。**

**マージより先に適用する。** main へのマージで Deploy が自動で走る一方、マイグレーションは
自動では走らない。後に回すと、テーブルが無いまま新しいコードが動く窓ができる。
列の削除など「先に適用すると今のコードが壊れる」変更のときだけ、デプロイ後に回す。

## 注意

- スキーマフィールドはcamelCase、DBカラムはsnake_case（`casing: 'snake_case'`）。クエリでは常にスキーマフィールドを参照する
- 大半のテーブルに `onDelete: 'cascade'` がない。FKを追加したらスキーマ全体をgrepして削除順序への影響を確認する
- `movies` のユニーク制約（imdbId/tmdbId）はsoft-deleted行も含む
