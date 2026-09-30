/**
 * ヴェネツィア国際映画祭の個人賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {
  VENICE_PERSON_AWARDS,
  importVenicePersonAwards,
} from './venice-person-awards';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'venice-person-awards',
    description: [
      '英語版Wikipediaの「Silver Lion」「Volpi Cup for Best Actor」「Volpi Cup for Best Actress」から銀獅子賞（監督賞）・ヴォルピ杯（男優賞・女優賞）を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      '受賞者はその映画のクレジットから人物を引き当てて1人1行で保存します。',
    ],
    firstYear: 1932,
    awards: VENICE_PERSON_AWARDS,
    importAwards: importVenicePersonAwards,
  });
}
