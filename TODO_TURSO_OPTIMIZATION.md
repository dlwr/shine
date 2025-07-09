# Turso書き込み削減 TODO

## 背景
Tursoの月次書き込み制限に達したため、データベース書き込み操作を最適化する必要がある。

## 主な問題点
1. スクレイパーが1映画あたり5-7回の個別書き込みを実行
2. 数百〜数千の映画を処理すると膨大な書き込み量になる
3. onConflictDoUpdateが更新不要でも書き込みとしてカウントされる可能性

## TODO リスト

### 優先度: 高
- [ ] movie-import-from-list.ts: バッチ挿入の実装（translations, posterUrls）
- [ ] movie-import-from-list.ts: 更新前の差分チェック実装（既存データと同じなら更新しない）
- [ ] cannes-film-festival.ts: バッチ挿入の実装（translations, posterUrls, referenceUrls）
- [ ] academy-awards.ts: バッチ挿入の実装
- [ ] japan-academy-awards.ts: バッチ挿入の実装

### 優先度: 中
- [ ] cannes-film-festival.ts: ポスターサイズを1つに削減（w342のみ保存）
- [ ] japanese-translations.ts: バッチ更新の実装
- [ ] movie-posters.ts: バッチ挿入の実装
- [ ] 全スクレイパー: onConflictDoUpdateの使用を最小限に（必要な場合のみ）

### 優先度: 低
- [ ] 全スクレイパー: --dry-runオプションの実装（書き込みせずに処理内容を確認）

## 実装例

### バッチ挿入の例
```typescript
// 現在の実装（個別挿入）
for (const translation of translations) {
  await database.insert(translations).values(translation);
}

// 改善後（バッチ挿入）
if (translationBatch.length > 0) {
  await database.insert(translations).values(translationBatch);
}
```

### 差分チェックの例
```typescript
// 更新前にチェック
const needsUpdate = existing.imdbId !== newImdbId || 
                   existing.tmdbId !== newTmdbId;

if (needsUpdate) {
  await database.update(movies).set(updates).where(...);
}
```

## 期待される効果
- 書き込み回数を1/5～1/7に削減
- Tursoの月次制限内での運用が可能に
- スクレイパーの実行時間も短縮