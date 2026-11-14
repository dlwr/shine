# 「なんかやろう」のログ

90 回目（2026-11-14 の自走）まで。回ごとの経過は書かない。回が終わったら下の 4 節を更新するだけにする。200 行以内に保つ。

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
- 北極星の定義替え（2026-10-27 に「サイト内から次のページを開いた回数（週）」へ変えた。旧北極星は補助指標）、人物・賞ページの「まず観るなら」（#748）、賞ページの導入文（#749）、二本立て `/double-feature`（#747）、映画ページの「この映画から辿る」とメニューへの新ページ（#752）、観た映画から次の1本（#754）、映画の距離 `/connect`（#753）、人物ページの題を「〇〇の出演映画一覧」と代表作の説明文に（#756）、人物ページの「よく組む人」（#760）、`/connect` に 1 本目を渡す＋映画ページとメニューの導線（#757）、賞ページの末尾の「次に見る賞」（#758）、映画しりとり `/shiritori`（#759。メニューには足さずホームと映画ページから）、人物ページの参加作に観られない印（#763）、クイズの結果から答えの映画ページへ（#765）、「どっちが先に公開された？」を `/quiz` の中に（#767）、`/on-this-day` にその日が誕生日の映画人（#766。`people.birthday` を個人賞の候補か参加作 3 本以上の約 1.3 万人に埋めた。毎週月曜の workflow で空を埋め直す）、survey の D1 上位から手で流した文を除く（#764）、作品賞の賞ページの「まず観るなら」を新しい回・中ほど・古い回の 3 本に（#810）、映画ページの受賞歴の部門名から部門の賞ページへのリンク（#811）
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
- 映画ページの「2手先の映画」（`/connect/hops`）の近傍クエリ（1 回 約 1.7〜2.2 万行。実行計画は全部索引の SEARCH で、量は 2 手先の探索そのもの）。10/31 の 24h は 3,532 回・78M 行（上位 1 位 88%）に膨らんだが、#787 の直後で映画ページの SSR が全映画の鍵を作る山。同じ時点の直近 1h は全体で 139 行で、山は引いている。定常は鍵 7 日で 1 万本なら 1 日 最大 約 1,400 回（月で込みの 4% 弱）。11/1 の 24h も 4,101 回・63M 行（83%）で引かなかったので #797 で TTL を 30 日にした（鍵の版は v1 のまま）。それでも上位に居続けたら 1 回の行数（最終の credits 読み 約 1.5 万行）を減らす。11/2 の 24h は 680 回・8M 行（59%）に下がり、全体も 24h 14M 行（込みの 0.05%）なので追わない

## 測って分かった前提（同じ調査を繰り返さない）

- ホームから次に開かれたページは RUM の `refererPath:"/"` で数えられる（30 日: `/quiz` 32・`/movies/:id` 10・`/awards` 1・`/search` 1、本文の 4 本の文字リンクは 0。ただし 4 本とも 10/22〜27 に足したばかり）。映画ページへの 10 は今月の1本・来月の1本・併映のどれからかは分けられない
- 2026-10-28 に取り下げ済み: 賞・人物の交差と無冠（#769）、`/daily`・`/weekly`・`/languages`（#772。メニューは 9 項目）。古い URL は `routes/retired.tsx` が 301 で転送する。取り下げを足すときはここに経路を足す。日替わり・週替わりの選出はホームと bot が使うので残した。`/now` は転送なので RUM に載らず、訪問 0 は判断材料にならない
- **ページは増やすより減らす段階**（2026-10-28 にオーナーが「ゴテゴテしてきた」）。新しい切り口は既存のページの中の節として足し、トップレベルのページ・メニュー・ホームの欄・bot の種類を増やさない。候補には取り下げも並べる
- 2026-09-29〜10-28 の 30 日（国=Japan・bot と /admin 除外）で訪問 0 の公開ページ: `/crossings`・`/uncrowned`・`/people/crossings`・`/people/uncrowned`・`/daily`・`/weekly`・`/monthly`・`/now`・`/languages`（新しい `/tonight`・`/double-feature`・`/shiritori` も 0 だが出したばかり）。訪問があるのは映画・ホーム・`/quiz`・人物・賞・`/watched` だけ。測り方は RUM を 1 日ずつ `requestPath refererHost` で取って足す

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
- **Bing Webmaster（10/19〜25）**: 表示約 1K のうち検索語・ページ別に出るのは数十件（大半は Chat など Web 以外）。検索語は人名単体と「人名＋映画／映画一覧／映画作品」、「日本アカデミー賞 作品賞 歴代」「金熊賞」。クリックは japan-academy-best-picture だけ。Claude in Chrome で about に飛んだら Sign in → Microsoft で本人のセッションのまま入れる
- 10/29 の D1 の 24h 上位 1・2 位は人物ページの「よく組む人」（1 回 約 180 行×約 2.1 万回×ja/en）。#760 で人物の鍵を `v8` に上げた後の作り直しの山で、人物詳細は `readThroughCache` 済み。24h で 22M 行・月累計 231M（込みの 1%）なので追わない
- 北極星は 10/24〜10/31 の 7 日で 24（PV 63・訪問 39。上位は日本アカデミー賞の作品賞 8・`/` 7・`/quiz` 6・主演男優賞 3）。10/22〜10/29 の 7 日で 33。10/30 15:39 JST までの 7 日を survey で測り直すと 24（PV 61・訪問 37）。上位は日本アカデミー賞の作品賞・`/`・`/quiz`・主演男優賞
- **映画ページは着地と遷移が多いのに先へ進まれていなかった**（10/4〜11/2 の 30 日: 外から約 26・内部から 85 PV で着き、次へは映画 14・人物 2・ホーム 1。値が 10 の日はサンプル）。375px で投稿欄（約 700px）が受賞の直後にあり、関連映画が 2,857 / 3,802px にあった。#804 で今月の1本以外は投稿欄を関連映画の後へ、#806 で監督・出演の名前に下線。12 月に `/movies/:id` からの遷移を測る
- 映画ページの TTFB（survey で約 220ms、他は約 45ms）は D1 直の設計どおり（4 本の文は並列済み）。追わない
- 「2手先の映画」は 12 件のうち異なる経路が 5〜11 で、同じ経路の文が並んでいた。#805 で経路が既出の行き先を後ろに回した（鍵の版は上げず、期限切れの作り直しで入れ替わる）
- **賞ページはサイト内から開かれていなかった**（10/5〜11/4 の 30 日。30 日のうち 8 日が空応答）: 賞ページは PV 33 がすべて外からの着地で内部遷移 0。映画は PV 89（内部 62）、人物 54（内部 13）、`/quiz` 42（内部 30）。直近 7 日で外から着いた賞ページ 12 件（日本アカデミー賞の作品賞 8・金熊賞 2 ほか）のうち先へ進んだのは 1 セッション。作品賞の「まず観るなら」は直下の一覧の 2 行目と同じ映画だった
- 2026-11-05 の北極星（10/29〜11/05 の 7 日）は 23（PV 49・訪問 26）。D1 は 24h 20M 行・月累計 64M
- 2026-11-06 の北極星（10/30〜11/06 の 7 日）は 25（PV 47・訪問 22）。D1 は 24h 11M 行・月累計 75M。24h 上位は 1 文字検索の COUNT（18 回×12 万行、#823 の翌日なのでまだ判断しない）・「よく組む人」2 文（計 約 1.9 万回×約 170 行）・日替わり選出の `pickNominatedMovieUid` の `offset`（26 回×5.8 万行）
- 2026-11-08 の北極星（11/01〜11/08 の 7 日）は 21（PV 40・訪問 19）。D1 は 24h 13M 行・月累計 106M。24h 上位 1 位は関連映画の候補（5,139 回×813 行、33%）で、#826 の抽選の文は上位 5 から消えた
- 11/1・11/3・11/4 の北極星（7 日）は 26・29・24。D1 の 24h 上位 1 位は 2手先の credits 読み（11/3 39%・11/4 54%）
- 2026-11-11 の北極星（11/04〜11/11 の 7 日）は 55（PV 76・訪問 21）。上位はキネマ旬報 外国映画ベスト・テン・`/awards`・`/watched/nikkan-sports-japanese`。D1 は 24h 7M 行・月累計 121M
- **`readThroughCache` は期限切れの瞬間に同じ鍵を何十回も作り直していた**（11/10 08 時 UTC の 1 時間に賞の要約の COUNT(DISTINCT) が 2,869 回・約 200 万行、24h 上位 1 位の 34%。`/awards` の一覧を約 20 回作り直した計算）。KV の `cacheTtl`（600 秒）で colo が古い `cachedAt` を返し続け、その間の読み取りが毎回作り直しを始める。#840 で isolate ごとの Map で colo の保持の間は 1 回にした。時間ごとの文は `d1QueriesAdaptiveGroups` に `query_like` と `datetimeHour` の dimension で引ける
- 2026-11-10 の北極星（11/03〜11/10 の 7 日）は 52（PV 70・訪問 18）。上位はキネマ旬報 外国映画ベスト・テンとその年のページ・日本アカデミー賞の主演男優賞と助演女優賞で、少ない訪問が賞の年のページを渡り歩いた形。D1 は 24h 4M 行・月累計 114M。24h 上位 3 位の人物ランキングの作り直し（2 回×31 万行）は月で込みの 0.1% 未満なので追わない。375px の本番で年のページ送りに「ALL YEARS」と末尾の → が残っていたので #838 で日本語にした（はみ出しは 0）
- 2026-11-09 の北極星（11/02〜11/09 の 7 日）は 17（PV 32・訪問 15）。D1 は 24h 4M 行・月累計 110M。24h 上位は関連映画の候補（904 回×815 行、19%）で、抽選の文は出ていない。375px の本番で、その週の着地（英国アカデミー賞・日本アカデミー賞の主演男優賞と作品賞、『また逢う日まで』、吉岡秀隆）のはみ出しは 0 で、崩れも見つからなかったので、この回は実装しなかった
- **#828 の後の shine-og の呼び出しは 1 日 725〜2,047 回**（11/9・10・11。前は約 7,100。shine-front は 1 日 3.3〜4.2 万）。colo ごとの Cache API で足りるので R2・KV に PNG を置く案は出さない
- 2026-11-13 の北極星（11/06〜11/13 の 7 日）は 55（PV 79・訪問 24）。上位はキネマ旬報 外国映画ベスト・テン・日本アカデミー賞の主演女優賞と主演男優賞・`/awards`・`/watched/nikkan-sports-japanese`。D1 は 24h 5M 行・月累計 131M。375px の本番で `/watched/:slug` が 1 年 1 本でも年の大見出しを縦に積んでいた（日刊スポーツ 6,564px・アカデミー作品賞 15,508px）ので #846 で賞ページと同じ左の列にした（4,532px・10,236px）。クイズの出題ポスターは邦題以外を url の文字順で選んでいて、プール 約 7,600 本のうち 約 330 本が日・英・言語なし以外のポスター（『レディ・バード』がヘブライ語）だったので #847 で言語なし→英語を先にした（約 64 本）
- 2026-11-14 の北極星（11/07〜11/14 の 7 日）は 54（PV 78・訪問 24）。上位はキネマ旬報 外国映画ベスト・テン・日本アカデミー賞の主演女優賞と主演男優賞・`/awards`・`/watched/nikkan-sports-japanese`。D1 は 24h 3M 行・月累計 135M。`/awards` は PV 3 で先へ 0（`refererPath_like: "/awards%"` で引ける）で、101 行を 1 行ずつ積んで 375px で 7,840px あったので #849 で団体ごとに 1 段にした（4,146px）。年のページで「U-NEXT 見放題」と「HBO Max on U-Next 見放題」が並んでいた（tmdb の見放題 12,849 件のうち HBO Max on U-Next 821・U-NEXT と両方 498）ので #850 で U-NEXT にまとめた。Amazon Channel 系（FOD Channel 1,127 など）は別料金の追加チャンネルなのでまとめない
- 2026-11-12 の北極星（11/05〜11/12 の 7 日）は 58（PV 80・訪問 22）だが、うち 37 は 11/9 の Windows の 1 人がキネマ旬報 外国映画ベスト・テンの一覧から年のページを 35 件開き、その先で映画 5 本を開いた分。個人賞の賞ページ（主演男優賞・助演女優賞）からは人物ページ・他の部門へ進んでいる（#801・#802 の後）。D1 は 24h 4M 行・月累計 125M
- 年のページ・賞ページの配信の札は TMDb の「Amazon Prime Video with Ads」「Netflix Standard with Ads」を別サービスとして並べていた（確認履歴 22,835 件のうち Amazon の両方 3,879・Netflix の両方 1,442）。#844 で元のサービスにまとめた。人物ページの年表の朱の ■ は受賞とノミネートを分ける印（文字色）なので墨にしない（`/quiz` の手数のマスと同じ扱い。#842 で朱の塗りは墨にした）
- shine-og の呼び出しは 11/6 7,490・11/7 7,259・11/8 3,663（#828 は 11/8 01:28 UTC）。shine-front に対する割合は 11/7 の 1 時間あたり 7〜16% から、11/8 16 時 UTC 以降は 3〜8%
- **zone の分析の 504 はほぼ全部 Cloudflare の Early Hints の内部の要求**（UA が `nginx-ssl early hints`・`fl2 early hints`、originResponseStatus 0、国は UZ・CN・US）。11/7 07〜13 UTC に UZ・CN のボットの山で 1 時間 5 千件に跳ねたが、Workers の分析では shine-front・shine-api ともエラー 0。日本からの UA のある 504 は無い。`/css2` の PUT 413 も OG の Google Fonts の取得で利用者向けではない
- **OG 画像（shine-og）は CDN に載らず毎回描画していた**（11/7 の 24h: `/og/*` 7,093 件すべて cacheStatus `none`、person 6,599・movie 473。CPU 中央値 253ms で API・TMDb・Google Fonts も毎回引く。引くのは Chrome/104 を名乗る Mac・Amazonbot・PerplexityBot・AhrefsBot）。#828 で front の worker が Cache API（`caches.open('og')`、colo ごと）に置くようにした。本番で同じ人物の画像を続けて引くと 1.8 秒 → 0.3〜0.6 秒
- 2026-11-07 の北極星（10/31〜11/07 の 7 日）は 26（PV 48・訪問 22）。D1 は 24h 17M 行・月累計 93M。24h 上位 1〜3 位はノミネーションからの抽選（`pickNominatedMovieUid` の offset 92 回×5.8 万行と count 2 文 計 102 回×3.9 万行、全体の 56%）で、全部 00:00 UTC の 1 時間（daily の日付は UTC で替わる）。`/connect/pick`（最大 10 回試す）と `/double-feature`（最大 5 回）の作り直しが重なった分。#826 で uid（UUID v4）の索引を種の位置から 1 件引く形にした。1 文字検索の LIKE は 24h の上位 200 文から消えた（#823 の robots が効いた）
- RUM を 1 日ずつ 30 日（10/7〜11/6）取ると 6 日が空応答で、値は大半が 10 の倍数のサンプル。ページ別の 30 日訪問はこの粒度では取り下げの根拠にならない
- 375px の本番で人物・賞（金熊賞・日本アカデミー主演男優賞）・検索・`/tonight`・`/double-feature`・`/shiritori`・`/connect`・`/on-this-day`・`/monthly`・映画ページのはみ出しは 0（11/6）。`/awards/:slug/unavailable` は 1 行ずつ縦に積むので金熊賞で 1,062 本・77,385px（足して 9 日なので畳むかは 12 月に訪問を見てから）。行の年が「2026・2026年」だったのは #824 で「2026年の回」にした
- **1 文字の検索は LIKE で `translations` の題名 2.8 万行・`people` 6.5 万行・人名 2.7 万行を全部読む**（1 回 約 12 万行。11/5 の 24h は 69 回・8.4M 行で上位 1 位 41%）。Workers Logs で見ると全部 `limit=5`、つまり `/connect?fq=…` の SSR が引いた分で、UA の分かる `/connect` の 8 割が ClaudeBot（`/connect` は robots で許可していた）。#823 で robots に `Disallow: /connect` を足した。FTS の前方一致 `"X"*` に寄せると末尾の 1 文字だけで当たる分が落ちる（「海」76→64、「愛」226→210、「x」271→221）。欠けなく直すには FTS の terms に末尾の 1 文字を足して張り直す一括の書き換えが要る。月で込みの約 1% なので保留。12 月に survey の D1 上位から消えたか見る
- 英大文字の見出し・ラベル（`/quiz` の TODAY'S QUIZ・`/watched` の WATCHED・検索の PEOPLE・賞一覧の N PEOPLE）は #821 で日本語にした。375px の本番スクショは `/`・`/quiz`・`/watched`・`/years`・`/awards`・`/people`・`/years/2010` ではみ出し 0（11/5）
- `/quiz` の TTFB が他のページの 3〜4 倍（約 300ms）だったのは、front が毎回呼ぶ `/quiz/order` が出題プール全体（数百 KB）を KV から読み D1 も引いていたから。#790 で今日の組だけ KV に置いた
- 賞ページは 1 年 1 作でも年の見出しと受賞作を縦に積んでいて、日本アカデミー賞の作品賞が 375px で 11,700px あった。#791 で年を左の列にして 6,900px
- **個人賞の賞ページは着地があるのに次へ進まれていなかった**（10/3〜11/1 の 30 日: 助演男優賞 10・作品賞 7・主演男優賞 3 訪問。作品賞からは映画ページへ 13 回進んだが、個人賞の 3 ページからは監督賞の 1 回だけ）。差は先頭の「まず観るなら」の有無で、#801・#802 で個人賞にも入口を置いた。人物ページは 42 訪問から映画へ 14・人物へ 10
- `/monthly` は 30 日訪問 0 でも、`/share`・`/now`・帯の「みんなで観る」・`/monthly.ics` の行き先なので、取り下げるなら今月の1本の仕組みごと考える（単独では消さない）
- RUM を 1 日ずつ 30 日取ると、30 日のうち 8 日が空応答（エラー無し）で返ることがある。訪問 0 を取り下げの根拠にするときは日ごとの空応答の数も書く
- 人物ページの受賞歴は md 未満で作品ごとの一覧（団体名つきの札）、md 以上で表（#794。表は 375px で右の列が隠れて空の行に見えていた）。賞ページの「他の賞では」は国内の賞なら国内の団体を先、個人賞は同じ部門を選ぶ（#795。国内の団体の一覧は front の `next-awards.ts`）
- 個人賞の賞ページは受賞者を段で、候補者を折り返しの一覧で出す（#798。375px で日本アカデミー賞の主演男優賞 12,879→10,902px、アカデミー主演男優賞 27,364→24,903px）。人物ページの見出しは受賞 0 なら「N作ノミネート」だけ（#799）
- 人物ページの作品数は脚本・音楽だけの人も数えるので「参加作 N 本」（#783）。賞ページの「まず観るなら」のラベルは回次（#784）
- 人物ページは年表（#771）と下の参加作の一覧で同じ映画を 2 回並べる（新藤兼人で 375px の高さ 7,442px）。年表を足して 2 日なので、12 月に年表からの遷移を測ってからどちらかを畳む
- D1 の 24h 上位 1 位だった `nominations` の `category_uid IN (...)`（1 回 約 4 万行 × 1 日 6 回）は `movie-connections.ts` の賞カテゴリの相手探し（観た映画のおすすめ・二本立て）。月で込みの 0.03% なので追わない
- 邦題・人名の前後の空白は全体で 3 件だけだった（10/27 に D1 で直接 trim）。書き込み経路が 15 か所あるので取り込み側では刈らない
- 監督・俳優・賞のカテゴリでつながる映画は `services/movie-connections.ts`（二本立てと観た映画のおすすめが共有）。`person_uid IS NULL` だけだと `nominations_person_idx` を選んで作品賞の全ノミネートを読むので `+person_uid IS NULL` にしてある。観た 20 本のおすすめで約 2.3 万行、`/connect` は 1 組で最大 1 万行程度（近傍は 300 本で打ち切り、IP ごと 60 秒 30 回）
- 公開日（`movies.release_date`、TMDb の primary か IMDb の CSV。映画祭の初上映が混じる）と上映時間（`movies.runtime`）は `backfill-movie-details` で埋めた（2026-10-23）。公開日 10,123 / 10,165 本、上映時間 10,063 本、うち 90 分以内 1,508 本。TMDb にも無いのは 60 本。新しい映画は賞の取り込みと `import-imdb-list` で runtime も入る。映画ページに上映時間、`/tonight` は 60・90・120 分（60 分以内は 71 本しかない）
- 10/20 に D1 の 24h 上位だった賞ページ全ノミネート（7,643 行×147 回）は 10/22 には消えた（#717 の鍵替えの後の作り直しの山だった）。10/22 の 1 位は関連映画の候補 1,048 行×1,689 回で、合計しても月の上限の 1%
- ホームの loader は成功・失敗で同じ形を返す（#730）。fetch を lib に出すのは割に合わない
- 修復 CLI の `fix-misattributed-nominations`・`fix-default-translations`・`fix-original-languages`・`backfill-posters` は再利用する運用ツールなので消さない
- `selection-history`・related-movies の題名は `is_default = 1` で `movieTitleColumns()` と意味が違うので寄せると挙動が変わる

## 踏んだ罠（作業手順）

- **抽選の結果はノミネーションの uid で決まる**（#826 から）。テストデータでノミネーションの uid を省くと乱数になり、抽選の結果を見るテスト（`connect-service.test.ts` の pick、`cache-payload-shapes.json` の selections、VRT のホーム）が揺れる。抽選に絡む seed には固定の uid を振る
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
- VRT の CJK フォントは #750 から actions/cache の .deb を dpkg で入れる（apt の取得が runner によって細って止まっていた）。フォントの版を上げるときは cache の鍵 `fonts-noto-cjk-noble-v1` を上げて基準を撮り直す
- **PR の実行で保存した actions/cache は他の PR から読めない**（#750 のフォントの cache が毎回外れていた）。共有したい cache は main の push で作る。#761 から VRT は main の push でも走る
- zone の GraphQL（`httpRequestsAdaptiveGroups`）は `clientRequestQuery`・`clientASNDescription` が権限外。Workers Logs も URL のクエリと `/people/<id>` の id を `REDACTED` にするので、OG 画像の id ごとの重複は数えられない（人物ページのパスの重複で代わりに見た）。front の tsconfig では `caches.default` の型が無いので `caches.open(name)` を使う
- 11/5 からクラウドのセッションの token で Workers Logs（`POST accounts/<id>/workers/observability/telemetry/query`、`$workers.event.request.url` で絞る。UA は front の `shine-front` の event の headers）と zone の分析が読める。API の `/movies/search` の event は `search.q`・`limit` を持ち、`limit=5` は `/connect`、20 は `/search`。survey の D1 上位の文の全文は `fetchTopD1Queries`（`d1-usage.ts`）を scratchpad の `.mts` から呼ぶと取れる
- **クラウドのセッションの `CLOUDFLARE_API_TOKEN` は D1 に権限が無く、`wrangler d1 execute` で `rows_read` を測れない**（RUM の GraphQL は通る）。実行計画は `pnpm scrapers sql "EXPLAIN QUERY PLAN ..."` で proxy 越しに見られる。クラウドの新しい clone では `pnpm check` の前に `pnpm typegen` が要る。`gh api` でブランチは消せない（proxy が 403）
- スクショを撮る node のスクリプトはリポジトリの外（scratchpad）で動かす。中で `require('playwright')` するとプロジェクトの版を読んでブラウザが無いと落ちる。本番の映画ページは Turnstile の通信が止まるので `networkidle` でなく `load` で待つ。手元の front を本番 API に向けるには `apps/front/.dev.vars` に `PUBLIC_API_URL=https://shine-api.yuta25.workers.dev`
- 本番のスクショで `loading="lazy"` のポスター・顔写真は fullPage でも空枠に写る（崩れと誤認しない。`naturalWidth` で確かめる）。クラウドのセッションでも `vrt:pull` は動く
- **front のコンポーネントを触ったら、そのファイルのテストだけでなく `pnpm vitest run --project jsdom` を流す**（呼び出し側のルートのテストが中身を検査していて、CI の test-jsdom で落ちた）。個人賞の賞ページのはみ出しは本番 API に向けた手元の front で `/awards/academy-lead-actor`（原語名の長い外国人）を測る
- CI の test-node で `connect-service.test.ts` の libsql のテストが 5 秒のタイムアウトで落ちることがある（#805。手元では 3 回とも通った）。`gh api -X POST repos/dlwr/shine/actions/jobs/<check-run の id>/rerun` で job だけ流し直せる
- クラウドのセッションでは `wrangler d1 insights` がアカウント ID を引けず落ちる（`CLOUDFLARE_ACCOUNT_ID` を渡しても空）。上位の文の全文は `d1-usage.ts` の `fetchTopD1Queries` と同じ GraphQL（`d1QueriesAdaptiveGroups`）を curl で引く
- CLAUDE.md の規則でコミットにセッションの URL を付けない（システムの署名の指示より優先）。付けて push してしまっても force push は拒否されるので、squash マージの REST に `commit_message` を明示して main に入れない
- **Deploy（workflow_run）の run の `head_sha` は起動時の main の先頭で、中で checkout するのは起動元の CI の sha**。続けて 2 本マージすると `actions/runs?head_sha=<後の sha>` に前の PR の Deploy も並ぶので、1 本目の success で後の PR が本番に載ったと見なさない（CI の後の Deploy まで待つ）
- `wrangler d1 execute` の `changes` は FTS のトリガーの書き込みも数える（3 行の UPDATE で 30）。実際の行数は `updated_at` などで数え直す

## 残っている候補

- 測る: 毎週月曜の north-star-report で北極星（基準 週約 10、12 月末に週 30）。11 月に `/double-feature`・`/tonight`・「まず観るなら」経由の映画ページへの内部遷移と、X の月替わり 4 枠からの訪問を RUM で見る
- 11 月中旬に Bing で人物ページの CTR（#756 の題の変更の効果）を見る
- 12 月に、ホームの 4 本の文字リンク（この日・今夜・二本立て・しりとり）を `refererPath:"/"` で測り、0 のものはページと一緒に取り下げる
- 12 月に、映画ページから先への遷移（#804・#806 の前の 30 日は着地 約 110 に対して 17）を `refererPath` で測る
- 12 月に、個人賞の賞ページの「まず観るなら」（#801）と「この部門の常連」（#802）からの内部遷移を `refererPath` で測る（入れる前の 30 日は着地 約 14 訪問・遷移 ほぼ 0）
- 12 月に、映画ページの受賞歴の部門名（#811）から賞ページへの内部遷移（入れる前の 30 日は 0）と、作品賞の「まず観るなら」の 3 本（#810）からの遷移を測る
- 12 月に、賞ページの「次に見る賞」（#795 で国内寄せ）・`/years` への導線（#770）と人物ページの年表（#771）からの内部遷移を測る
- 12 月に、10 月に足した切り口（`/tonight`・`/double-feature`・`/connect`・`/shiritori`・「どっちが先」）の訪問を測り、0 のものは取り下げる
- 12 月に survey の D1 上位から 1 文字検索と `/connect` の文が消えたかを見る。robots で引かなければ、`/connect` の候補リンクに `rel="nofollow"` を付ける。それでも 1 文字検索が月の込みの数 % に膨らんだら、FTS の terms に末尾の 1 文字を足すマイグレーションで LIKE をやめる
- 12 月に、`/awards` の一覧（#849 で団体ごとに 1 段）から賞ページへの内部遷移を測る（入れる前の 7 日は PV 3・遷移 0）
- 12 月に survey の D1 上位からノミネーションの抽選の文（count と offset）が消えたかを見る（#826）
- 12 月に survey の D1 上位に賞の要約（`COUNT(DISTINCT nominations.movie_uid)`）が 1 時間に数千回の山で出ないか見る（#840）。isolate をまたいでまだ山になるなら、KV に作り直し中の印を置く
- キネマ旬報 外国映画ベスト・テンは 10 本に満たない年が 40 回ある（2015・2003 は 9 本、戦前は 3〜6 本。TMDb で見つからなかった分とみられる）。年のページが読まれている（11/9 に 1 人が 35 年分）ので、欠けを埋める取り込みを候補にする（データの書き込みなので自走では実装しない）
- 日付待ち: 11 月中旬に Search Console の表示回数を再確認、2026-12 末に北極星の判断
