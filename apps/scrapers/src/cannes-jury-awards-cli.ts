/**
 * カンヌ国際映画祭の作品系サブ賞（グランプリ・審査員賞）取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {CANNES_JURY_AWARDS, importCannesJuryAwards} from './cannes-jury-awards';
import {createEnWikipediaAwardCommand} from './common/en-wikipedia-award-cli';

export function createCommand(): Command {
  return createEnWikipediaAwardCommand({
    name: 'cannes-jury-awards',
    description: [
      '英語版Wikipediaの「Grand Prix (Cannes Film Festival)」「Jury Prize (Cannes Film Festival)」から',
      'グランプリ・審査員賞の受賞作を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、受賞作を1作1行で保存します。',
    ],
    firstYear: 1946,
    awards: CANNES_JURY_AWARDS,
    importAwards: importCannesJuryAwards,
  });
}
