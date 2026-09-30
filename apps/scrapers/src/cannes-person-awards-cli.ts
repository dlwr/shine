/**
 * カンヌ国際映画祭の個人賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {
  CANNES_PERSON_AWARDS,
  importCannesPersonAwards,
} from './cannes-person-awards';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'cannes-person-awards',
    description: [
      '英語版Wikipediaの「Cannes Film Festival Award for Best Director」などから監督賞・男優賞・女優賞を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      '受賞者はその映画のクレジットから人物を引き当てて1人1行で保存します。',
    ],
    firstYear: 1946,
    awards: CANNES_PERSON_AWARDS,
    importAwards: importCannesPersonAwards,
  });
}
