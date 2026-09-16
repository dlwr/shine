# 調査報告: Monthly Movie が勝手に更新された件

## 調査結果サマリー

**バグを発見しました。** JavaScriptのDate操作における日付オーバーフロー問題が原因です。

---

## 発見したバグ

### 問題箇所

**ファイル**: [apps/api/src/services/selections-service.ts](apps/api/src/services/selections-service.ts#L133-L135)

```typescript
// 現在のコード（バグあり）
const nextMonth = new Date(now);
nextMonth.setMonth(now.getMonth() + 1); // ← 先にsetMonth
nextMonth.setDate(1); // ← その後setDate
```

### バグの説明

1月29日〜31日のような「次の月に存在しない日付」で実行すると問題が発生：

```
Start: 2026-01-30 (1月30日)
↓ setMonth(+1)
2026-03-02 ← 2月30日は存在しないので3月2日に自動調整！
↓ setDate(1)
2026-03-01 ← 結果として3月1日になる
```

つまり、1月の終わり頃にpreviewエンドポイントにアクセスすると、「次の月」が2月ではなく3月と計算されてしまう。

### 影響

- 1月29日〜31日に `/admin/movies/selections` にアクセスすると、3月の映画が表示・作成される
- ユーザーは「2月の映画が変わった」と認識する
- 毎月29日〜31日に同様の問題が発生する可能性（2月以外の月では31日まである月が多いので発生頻度は低い）

---

## 修正計画

### 修正内容

`setDate(1)` を `setMonth()` の**前**に呼ぶように順序を変更する：

```typescript
// 修正後
const nextMonth = new Date(now);
nextMonth.setDate(1); // ← 先にsetDateで1日に設定
nextMonth.setMonth(now.getMonth() + 1); // ← その後setMonth
```

### 修正対象ファイル

- [apps/api/src/services/selections-service.ts:133-135](apps/api/src/services/selections-service.ts#L133-L135)

### 検証方法

1. 単体テストを追加して、月末日付での「次の月」計算が正しいことを確認
2. ローカルで1月30日、31日の日付をシミュレートしてテスト
3. `pnpm lint:fix && pnpm check` で型エラー・Lintエラーがないことを確認

---

## UIラベルの問題（別件）

管理画面のUIラベルも紛らわしいので、必要であれば修正を検討：

- 現在: 「今日の映画」「今週の映画」「今月の映画」
- 実際: 明日/来週/来月の映画を表示

これは別のIssueとして対応可能。

---

## 即時対応について

現在のDB状態：

- 2月: 宇宙探索編集部（正常）
- 3月: Flowers of Shanghai（バグで作成されたが、そのままでOKとのこと）

修正後、2月1日以降は正常に動作するようになる。
