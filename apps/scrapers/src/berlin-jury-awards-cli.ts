/**
 * ベルリン国際映画祭の作品系サブ賞（銀熊賞 審査員グランプリ・審査員賞）取り込みのCLIエントリーポイント
 */
import {BERLIN_JURY_AWARDS, importBerlinJuryAwards} from './berlin-jury-awards';
import {runEnWikipediaAwardCli} from './common/en-wikipedia-award-cli';

await runEnWikipediaAwardCli({
  name: 'berlin-jury-awards',
  description: [
    '英語版Wikipediaの「Silver Bear Grand Jury Prize」「Silver Bear Jury Prize」から',
    '銀熊賞（審査員グランプリ）・銀熊賞（審査員賞）の受賞作を取り込みます。',
    '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、受賞作を1作1行で保存します。',
  ],
  firstYear: 1951,
  awards: BERLIN_JURY_AWARDS,
  importAwards: importBerlinJuryAwards,
});
