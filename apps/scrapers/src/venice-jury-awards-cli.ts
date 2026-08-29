/**
 * ヴェネツィア国際映画祭の作品系サブ賞（審査員大賞・審査員特別賞）取り込みのCLIエントリーポイント
 */
import {runEnWikipediaAwardCli} from './common/en-wikipedia-award-cli';
import {importVeniceJuryAwards, VENICE_JURY_AWARDS} from './venice-jury-awards';

await runEnWikipediaAwardCli({
  name: 'venice-jury-awards',
  description: [
    '英語版Wikipediaの「Grand Jury Prize (Venice Film Festival)」「Special Jury Prize (Venice Film Festival)」から',
    '審査員大賞・審査員特別賞の受賞作を取り込みます。',
    '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、受賞作を1作1行で保存します。',
  ],
  firstYear: 1932,
  awards: VENICE_JURY_AWARDS,
  importAwards: importVeniceJuryAwards,
});
