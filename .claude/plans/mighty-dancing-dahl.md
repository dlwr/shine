# Fix: 連日同じ映画が選択されるバグ

## Context

2日連続で同じ映画（メガロポリス）が日替わり映画として選択される現象が発生。DBで確認済み：

- 3/11: メガロポリス (index=2473)
- 3/12: メガロポリス (index=2472)

## 根本原因

**2つの問題の組み合わせ**：

### 1. ハッシュ関数の分散が極めて悪い

`simpleHash` は日付文字列の最後の1-2文字しか変わらないため、連続する日のseed差がたった**1**になる。

```
2026-03-10 → seed=2134541870, index=2474
2026-03-11 → seed=2134541869, index=2473  (差: 1)
2026-03-12 → seed=2134541868, index=2472  (差: 1)
```

年間336日ペア中**312ペア（93%）**でインデックス差が10以内。

### 2. nominationsプールが映画ごとにソートされている

`selectMovieFromNominations` で `.orderBy(nominations.movieUid, nominations.uid)` を使っているため、同じ映画のnominationsが隣接する。メガロポリスは2つのnominationを持ち、index 2472と2473に並んでいる。

**結果**: 連日のハッシュが隣接インデックスを生成 → 同じ映画の別nominationを選択 → **同じ映画が連日選ばれる確率が非常に高い**。

## 修正内容

### Step 1: ハッシュ関数を改善

**対象ファイル:** `apps/api/src/services/selections-service.ts`（`simpleHash` メソッド）
**対象ファイル:** `apps/api/src/routes/selections.ts`（`simpleHash` 関数）

現在の `simpleHash` をより分散の良いFNV-1aベースのハッシュ関数に置き換える：

```typescript
private simpleHash(input: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let index = 0; index < input.length; index++) {
    const char = input.codePointAt(index) || 0;
    hash ^= char;
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return Math.abs(hash | 0);
}
```

※ `selections.ts` のスタンドアロン `simpleHash` 関数も同様に更新する。

### Step 2: 既存の選択をクリーンアップ

デプロイ後に `DELETE /admin/cleanup-future-selections` を実行して、古いハッシュで生成された未来の選択を削除し、新しいハッシュで再生成させる。

## 変更対象ファイル

- `apps/api/src/services/selections-service.ts` - ハッシュ関数改善 + プレビュー永続化修正
- `apps/api/src/routes/selections.ts` - ハッシュ関数改善（同じ関数が重複定義されている）

## TDD アプローチ

### Red: まずテストを書く

`apps/api/src/services/selections-service.test.ts`（新規作成）にテストを書く：

1. **連続する日のハッシュ分散テスト**: 年間365日の連続ペアで、`seed % poolSize` のインデックス差が十分大きい（例: 差 > 50）ことを確認
2. **同じ映画が連続しないテスト**: 実際のプールサイズ（4881）で、連続する日のインデックスが同じ映画のnomination帯域に入らないことを確認
3. **決定性テスト**: 同じ入力に対して常に同じハッシュ値を返す

### Green: テストを通す実装

`simpleHash` をFNV-1aに置き換え

### Refactor: 必要に応じてリファクタ

## 検証方法

1. `pnpm lint:fix && pnpm check` でlint/type checkを通す
2. 新規テストがすべて通ることを確認
3. `pnpm run test:front` で既存テスト通過を確認
4. デプロイ後、`/admin/cleanup-future-selections` で未来選択をクリーンアップ
