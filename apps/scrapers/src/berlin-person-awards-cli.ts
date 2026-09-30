/**
 * ベルリン国際映画祭の個人賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {
  BERLIN_PERSON_AWARDS,
  importBerlinPersonAwards,
} from './berlin-person-awards';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'berlin-person-awards',
    description: [
      '英語版Wikipediaの「Silver Bear for Best Director」「Silver Bear for Best Actor」「Silver Bear for Best Actress」',
      '「Silver Bear for Best Leading Performance」「Silver Bear for Best Supporting Performance」から',
      '銀熊賞の監督賞・男優賞・女優賞（〜2020年）・主演俳優賞・助演俳優賞（2021年〜）を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      '受賞者はその映画のクレジットから人物を引き当てて1人1行で保存します。',
    ],
    firstYear: 1951,
    awards: BERLIN_PERSON_AWARDS,
    importAwards: importBerlinPersonAwards,
  });
}
