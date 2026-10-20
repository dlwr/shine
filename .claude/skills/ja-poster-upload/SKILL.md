---
name: ja-poster-upload
description: 日本語ポスターの無い外国映画に、映画.com のポスターを TMDb へ投稿して SHINE に取り込む。「日本語ポスターを埋めて」「TMDb にポスターを上げて」と言われたときに読む
---

# 日本語ポスターを TMDb に投稿する

TMDb へのポスター投稿は本人が許可済み（TMDb の画像投稿に限る）。1 回 10 本まで。

## 手順

1. `pnpm scrapers ja-poster-worklist --limit 10` で候補を出す（今月の選出 → 受賞作 → その他の順）。TMDb に日本語ポスターが既にあるものは毎日 04:00 JST の `sync-ja-posters` が取り込むので、候補には出ない前提だが、念のため TMDb の画像一覧で ja が無いことを見る
2. `eigaSearchUrl` を curl で取り、`href="/movie/<id>/"` と題名の組から作品を選ぶ。作品ページで年（「1986年の」など）か監督が SHINE の映画と一致することを確かめる。合わなければ飛ばして報告する
3. ポスターは作品ページの `<img width="92" ... src=".../photo/<hash>/160.jpg">`（og:image は場面写真なので使わない）。`/photo/<hash>.jpg` が原寸（例 566x800）。Read で開いて邦題入りのポスターであることを目で確かめる
4. TMDb の条件は JPEG・最小 500x750・縦横比 2:3。`magick in.jpg -gravity center -crop <W>x<H>+0+0 +repage -quality 95 out.jpg` で 2:3 に切る（幅が余れば左右、高さが余れば上下）。500x750 未満なら飛ばす
5. 実 Chrome（claude-in-chrome）で `tmdbPostersUrl` を開く。「ポスター画像」見出しの ⊕ で Upload Posters を開き、`find` で modal の file input を探して `file_upload`（ファイルはスクラッチパッドに置く）。Auto upload で即アップロードされる
6. モーダルを閉じ、`?image_language=xx` の一覧で自分（yuta25）が上げたカードの言語のコンボボックスを開き、`ja-JP` と打って「日本語 (ja-JP)」を選ぶ。`?image_language=ja` に出れば保存済み
7. TMDb の API への反映は遅れる（言語指定なしの `/images` は CDN にキャッシュされ数時間古い。`include_image_language=ja` を付けると即出る）。反映後に `pnpm scrapers sync-ja-posters`（候補全件なので時間がかかる。急ぐなら管理画面の「TMDb情報更新」）で取り込む。間に合わなくても翌日の cron が拾う

## 罠

- モーダルを閉じた直後はタブが固まりスクリーンショットが落ちることがある。URL を開き直す
- 言語のコンボボックスは ref でクリックすると画面がスクロールするだけで開かないことがある。スクリーンショットの座標でクリックする
