# 「なんかやろう」のログ

67 回目（2026-10-27）まで。回ごとの経過は書かない。回が終わったら下の 4 節を更新するだけにする。200 行以内に保つ。

## もう出さない候補（理由つき）

### 北極星

- 「今月の映画を見た人の数」を指標にする（測れない。共有 URL `?s=` の閲覧数は受け手の数）。匿名の「観た」カウンタ `watched_marks` は補助として入れ済みで、北極星の定義は変えない
- 月替わり選出に視聴可否の条件（`availability-check.yml` が次の選出を確認し、観られなければ `/reselect` で再抽選する）
- `/monthly/2026-09` のような月ごとのページ・「このサイトについて」ページ（リンクの置き場は映画ページ。一覧の `/monthly` は別物で存在する）
- 10 月の1本の下見・先月の1本の投稿枠延長（4 回選ばれず）、今月の1本の選び方に知名度の下限（価値 3 を曲げる）
- Bluesky・はてブの自動拾い（拾えるのは自分のページの共有で北極星から除く必要がある。Bluesky の検索は認証必須）
- 外で書いた人への声かけ・書き手探し（「普通にリンクするだけ」）、Misskey.io に bot、月の1本に選出理由（`reason` 列）
- bot の月後半の文言（3 回選ばれず）、賞の速報カレンダーを Discord のリマインダに（3 回選ばれず）
- `/quiz` に今月の1本を 1 問（4 回選ばれず）
- 北極星の定義替え（2026-10-27 に「サイト内から次のページを開いた回数（週）」へ変えた。旧北極星は補助指標）、人物・賞ページの「まず観るなら」（#748）、賞ページの導入文（#749）、二本立て `/double-feature`（#747）
- 北極星の数え始め（2026-10-20 に前月 20 日の予告起点にした。即時紹介と「観た」も同じ起点）
- X の月替わり 4 枠のカード付き化（#739）、Web Share Target（#743。Android の Chrome でホーム画面に追加した人だけ。iOS は非対応）
- 投稿欄の文言、`/fetch-url-title` の文字参照、`/monthly` の先頭に今月の1本と投稿導線、観たボタンを今月の1本なら「ひとこと残す ↓」に、ホームの今月の1本の下に 20 日〜月末だけ来月の1本（どれも実装済み）

### 流入・SEO

- インデックス促進系（SEO 一式は 2026-07〜08 に出し切った）。Google 向けの点検（robots・sitemap・canonical・JSON-LD・soft 404・人物の noindex）も済み
- 流入減の原因調査（2026-09-04 からの Google の表示回数の落ち込みは評価側でサイトに原因なし。薄い映画と人物は noindex 済み）
- ja のあらすじを ja.wikipedia の導入文で埋める（noindex 対象のうち記事があるのは 8 本だけで解除に効かない。既に索引される映画に解説文を載せるだけになる）
- `/search` の robots の Disallow を戻す（noindex だけだとクローラが取得して重い読み取りになる）
- サービス名を変えるリブランド（#420 を close 済み）

### データ

- 賞を足す（認知面で飽和）、邦題の補完（Wikidata・sitelink 優先で天井）、ポスターの補完（無いものの大半は TMDb にも無い）
- TMDb への邦題・あらすじの一括投稿（選出時に 1 本ずつ）、TMDb のキャストの上限（上位 10 名）の拡大
- 邦題どうしの同名別作品の誤判定（5 回選ばれず）
- ポスターの経路（#682〜#686 で点検済み）

### 保守・リファクタ

- `any` の棚卸し（手書き 0 件）、Lighthouse の `target-size`（本文中のリンクは WCAG の対象外）
- サイズ起点の front・API・scrapers の分割（中身を読んで割らないと判断）。`en-wikipedia-award.ts` は 1 つの経路で凝集しているので割らない
- 不変条件のテスト化（公開経路の KV キャッシュ・映画削除の FK・キャッシュ鍵の版は固定済み）
- 手書きの openapi.yml（#673 で消した。公開 API の文書が要るならコードから生成する）
- scrapers の CLI 引数の検査（`common/cli-options.ts` の `integerAtLeast`・`oneOf` に寄せ済み。新しい CLI はこれを使う）
- 賞の取り込み CLI の組み立て関数への寄せ（個人賞は `createAwardImportCommand`、作品賞は `createFilmAwardCommand` に載った。academy-awards と japan-person-awards は形が違うので載せない）
- front の `response.json() as T` の残り（`loadApiJson`/`tryApiJson`/`adminJson` に寄せて残り 25。もう価値が薄い）
- SNS の workflow の共通化、CI の並列化（lint／型検査・knip・ビルド／テスト、vitest の project で分割）、deploy の再試行（`scripts/retry.sh`）、X と Bluesky の 5xx の再試行
- 題名の列（`movie-title-columns.ts` に集約済み）、クイズの出題プールのポスター選択（#711）
- admin 認証の httpOnly Cookie 化、React Compiler 系の react-hooks の新ルール、`PRAGMA foreign_keys`（2026-07-31 の監査で見送り）
- availability-check の定刻実行

### パフォーマンス

- 一般論としての TTFB・バンドルの改善は打ち止め。前提を崩す材料（`wrangler d1 insights` や survey の D1 上位の文）が出たときだけ出す
- `/years/:year` の年一覧、賞の詳細の授賞年（キャッシュから前後の年を決める形にした）、関連映画（受賞作→ノミネート作の 2 段、鍵を ja/en 共通に）、`localizedPosterUrl`（索引と COALESCE で必要な 1 枚だけ読む）
- 関連映画の候補クエリ（1 回 約 1,300 行）は年の近さで並べるので同カテゴリの受賞作を全部読むのは避けられない
- 冷えた経路の KV→D1 直の比較（済み。映画詳細は D1 直、`/` だけ D1 直は見送り）
- `movie_availability_checks` を (movie, source) ごとの最新だけ SQL で引く（履歴は 1 組平均 1.9 行。無作為の 100 本で rows_read 1,526 → 1,459 と 4% しか減らず、集約クエリと実行計画テストが増えるだけ。履歴は監査に使うので刈り込まない）
- 管理画面の授賞式一覧（`listCeremonies` の式典ごとの COUNT(DISTINCT)、1 回 約 7 万行×1 日 3 回、月 約 600 万行で込みの 0.02%）。本人しか開かない
- 関連映画の候補クエリが survey の 24h 上位 1 位（54%）でも追わない。`/movies/:id/related` は KV に載っていて、1 日 約 2,000 回はクローラが冷えた映画を引く分。合計しても込みの 1% 未満
- 人物ランキング（`people-ranking.ts`、作り直し 1 回 約 32 万行）を `readThroughCache` に載せる（呼び出し元の `/people` の一覧が `people:list:*` で既に載っていて、作り直しは期限切れの一覧の裏の再生成で走る。待つのは未キャッシュの page/limit の組だけ）

## 測って分かった前提（同じ調査を繰り返さない）

- **「なんかやろう」ではまず main の CI が緑か見る**（D1 の実行計画テストのタイムアウトや VRT の揺れで main の Deploy が止まっていたことがある）
- **外部の入口は 2026-10-19 の Bing Webmaster 登録から Bing が主役**（10/20〜27 の外部 26 訪問のうち Bing 21・Ecosia 3・Google 1・X 1）。着地は人物 11・日本アカデミー賞系 7・映画 4・`/years` 2 で、今月の1本は 0
- 回遊は RUM で測れる: `refererHost:"shine-film.com"` の PV が内部遷移（SPA の遷移は visits 0 で載る）。#746 から admin にログインしたことのある端末（`adminToken` か `shine-owner-device`）は beacon を読み込まないので、それ以前の値には本人の Android が週 30 件ほど混ざる
- RUM の 7 日窓でもパスだけで集めるとサンプル推定に落ちる。`date` を dimensions に足してパスごとに足す（survey は #706 でそうなった）。Cloudflare の GraphQL はエラー無しで 0 件を返す回がある
- シンガポールの Windows の大量の訪問は bot。国=Japan で絞る
- X の投稿は裸ドメインでカードが付かない。リンク入りにすると 1 件の課金が $0.015 → $0.20。クイズの投稿も裸ドメインでクリックは取れているので、カードの有無が差とは言い切れない
- 冷えた KV の読みは 136ms〜3.6 秒とばらつき、APAC の D1 を数往復引くより遅いことが多い。デプロイ直後は鍵が冷えているので測らない。survey の 3 ラウンドで 70ms 程度の差は揺れ。worker の起動は TTFB の原因ではない
- ホームの JS は brotli 118KB のうち約 107KB がフレームワークで削る余地なし。Lighthouse の SEO は 5 ページとも 100、a11y 96〜100
- D1 の読み取りは全体で月 1 億行強（込みは 250 億行）と小さい。7 日の上位は関連映画の候補・題名とポスター・クレジット。survey の 24h の上位は窓の偏りが出るので 7 日でも見る
- D1 の読み取りの内訳は `wrangler d1 insights shine-main --timePeriod 1d --sort-type sum --sort-by reads --json`（apps/api で）
- `readThroughCache` に載せていないのは `/people/search`（鍵が利用者入力）と人物ランキングのチャンク（チャンクは一覧の裏の再生成からしか読まれないので載せなくてよい）。**キャッシュの候補は呼び出し元のルートまで辿ってから出す**
- coverage: API 行 約 81%（公開経路 87〜93%）、scrapers 約 63%（`north-star.ts` 96%）。lint 抑制は全部理由つき、TODO/FIXME 0
- bot の投稿への反応はゼロ
- 2026-09-24 にさざなみに付いた fc2 ブログのリンクは本人が貼ったもの（`is_owner_submission=1`）で、起点を変えても他人に数えない
- survey の D1 上位は 1 回きりの文（手で流した集計）を除いて出す。除いた本数と行数は 1 行で出る
- 観たボタンは壊れていない（localStorage で既にチェック済みだと押しても送られない）
- PWA manifest は無い
- squash のコミット本文はコミットメッセージから作られ PR 本文は入らない。survey の Actions 欄はマージ済み PR の本文も見て「手当て済み」を判定する
- knip は front の型生成（type-check が作る `+types`）に依存するので型検査より後に流す
- テストの DB: ローカル D1 は 1 クエリ約 6.6ms・起動＋migrate 約 1.7 秒、libsql は API 1175 件で 10.6 秒。全面移行は割に合わず、D1 に寄せるのは D1 固有の制約の経路と実行計画のテストだけ。scrapers は本番が proxy なので binding のテストにしても意味がない
- 公開日（`movies.release_date`、TMDb の primary か IMDb の CSV。映画祭の初上映が混じる）と上映時間（`movies.runtime`）は `backfill-movie-details` で埋めた（2026-10-23）。公開日 10,123 / 10,165 本、上映時間 10,063 本、うち 90 分以内 1,508 本。TMDb にも無いのは 60 本。新しい映画は賞の取り込みと `import-imdb-list` で runtime も入る。映画ページに上映時間、`/tonight` は 60・90・120 分（60 分以内は 71 本しかない）
- 10/20 に D1 の 24h 上位だった賞ページ全ノミネート（7,643 行×147 回）は 10/22 には消えた（#717 の鍵替えの後の作り直しの山だった）。10/22 の 1 位は関連映画の候補 1,048 行×1,689 回で、合計しても月の上限の 1%
- ホームの loader は成功・失敗で同じ形を返す（#730）。fetch を lib に出すのは割に合わない
- 修復 CLI の `fix-misattributed-nominations`・`fix-default-translations`・`fix-original-languages`・`backfill-posters` は再利用する運用ツールなので消さない
- `selection-history`・related-movies の題名は `is_default = 1` で `movieTitleColumns()` と意味が違うので寄せると挙動が変わる

## 踏んだ罠（作業手順）

- **テスト用の表を手書きの DDL で作っているファイルがある**（`packages/tmdb/src/__tests__/persistence-soft-delete.test.ts`）。列を足したら `grep -rn "release_date text"` のように探して足す。`test:scrapers` だけ流すと見落とす
- **`gh pr checks <n> | awk ... && gh pr merge` と繋ぐと、落ちたチェックがあってもマージされる**（#739 で test-node が赤のまま main に入った。Deploy は CI の失敗で止まる）。待つときは目当てのチェックが出て pending が無くなるまで回し、結果を見てからマージする。sns の文面を変えたら `sns-post-cli.test.ts` のインラインスナップショットも直す（`apps/scrapers/src/sns` だけ流すと見落とす）
- VRT のコンテナの apt は `azure.archive.ubuntu.com` に向けている（#742）。`archive.ubuntu.com` は runner から詰まることがある
- 本番で数千件書く CLI は proxy の一時エラーで数件落ちる。NULL だけ埋める形にしておけば流し直すだけで済む
- **`Write` は既存ファイルを黙って上書きする。テストを書く前に `ls <dir> | grep <name>` と `__tests__/` を見る**。「無い」と判断する前に場所違いを疑う（knip の "Unused files" が教えてくれる）
- `git add -A` は使わずパスを明示する。`git add <消えたパス> <他>` は全体が失敗するので `git status --short` を見てから。コミットを分けるだけなら stash を積まず `git add <パス>` → commit を繰り返す。`git stash` は untracked を退避しない
- 積み PR の親を `--delete-branch` でマージすると子が閉じる。先に子のベースを main へ。載せ替えは `git rebase --onto origin/main <親の最終コミット>`。別ブランチで `pnpm remove` したら `pnpm install --frozen-lockfile` で戻す
- リファクタで挙動不変を示す手: `public-read-query-plan.test.ts` の execute にログを挟んで前後の SQL を突き合わせる（経路名で引き当てる。実行順は走るたびに変わる）、API の service を `getDatabase(loadScraperEnvironment())` の proxy 接続に渡して新旧の出力を JSON で突き合わせる（`tmp/` は gitignore 済み）、`cache-payload-shapes.json` が変わらないこと、スクレイパーは本番の wikitext を食わせた出力の JSON diff、bot は dry-run の出力、分割は「import 以外の行の多重集合が前後で一致」
- テストが振る舞いを捉えているかは、実装をわざと壊して対応するテストだけが落ちることで確かめる
- **本番のクエリの行数は `wrangler d1 execute shine-main --remote --json --command "<SQL>"` の `meta.rows_read` で測る**。`--file` はファイル投入の要約を返すだけで本当の行数が出ない
- **Python で置換・切り貼りするときは先に全部の `assert s.count(old)==1` を検査してから**（空振りでキャッシュ処理を丸ごと消した）。`const` 行だけ拾うと上の doc コメントを落とす
- **`pnpm check` は prettier を見ない**。`pnpm format` は `--check` だけで直さない（直すのは `pnpm format:fix` か `prettier --write <file>`）。sed・python で書き換えた後は push 前に `pnpm format` を通す（`db:generate` の meta JSON も落ちる）
- **try の中の `return promise` は `return await` にしないと catch を素通りする**
- **libsql の `transaction('read')` は file: DB では INSERT を止めない**（読み取り専用の検査は文字列で）
- 管理ルートの 500 経路のテストは、マイグレーションを流していない DB ファイルを渡すと作れる
- **`isolate: false` の下ではモック・環境変数・localStorage・遅延読み込みの温まり具合がファイルをまたいで漏れる**。ファイル順のシャッフルは同じシードでも worker の割り当てで再現しないので入れない（ファイル内だけ混ぜる）。isolate を有効にすると jsdom が 10 秒→70〜130 秒
- **`vi.stubEnv(key, undefined)` は本物の dotenv に `.env`/`.dev.vars` から埋め戻される**。空文字で塞ぐ
- **TTFB は必ずブラウザの UA で測る**。curl・node fetch・短い UA は isbot でボット扱いになり、entry.server が allReady まで待つ経路を測ってしまう
- `gh pr merge` は `gh pr checks --watch` が "no checks reported" を返しても通ってしまう。push 直後はチェックが登録されるのを待ってから watch する
- zsh は変数を単語分割しない（ファイル一覧は `${=F}`）。`localeCompare('ja')` はヴ を う の位置に置く
- **mac の `vrt:update`（Docker）が miniflare の D1 の migrate で `SocketError: other side closed` になって撮れないことがある**（基準の PNG を消してから落ちるので `git checkout -- apps/front/vrt/__screenshots__` で戻す）。基準は push して CI の VRT を落とし、`vrt:pull` で取ってくる（#745）
- VRT の映画ページのはみ出し検査は `networkidle` 待ちで揺れることがある（流し直しで通る）
- VRT の CJK フォントの apt が `Reading package lists...` で 3 回とも止まって 10 分で落ちることがある（`gh run rerun <id> --failed` で通る）
- Bing Webmaster の built-in browser のセッションは切れることがある（about に飛ぶ）。本人のログインが要る

## 残っている候補

- 測る: 毎週月曜の north-star-report で北極星（基準 週約 10、12 月末に週 30）。11 月に `/double-feature`・`/tonight`・「まず観るなら」経由の映画ページへの内部遷移と、X の月替わり 4 枠からの訪問を RUM で見る
- Bing Webmaster の検索語（本人のログイン後）を見て、表示が多くクリックの少ないページの題と導入文を直す
- 日付待ち: 11 月中旬に Search Console の表示回数を再確認、2026-12 末に北極星の判断
