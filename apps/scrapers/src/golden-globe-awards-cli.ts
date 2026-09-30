/**
 * ゴールデングローブ賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {
  GOLDEN_GLOBE_AWARDS,
  importGoldenGlobeAwards,
} from './golden-globe-awards';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'golden-globe-awards',
    description: [
      '英語版Wikipediaの「Golden Globe Award for Best Motion Picture – Drama」などから作品賞と個人賞を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      '個人賞はその映画のクレジットから人物を引き当てて1人1行で保存します。',
    ],
    firstYear: 1944,
    yearDescription: '取り込む授賞式の年を1つに絞る',
    awards: GOLDEN_GLOBE_AWARDS,
    importAwards: importGoldenGlobeAwards,
  });
}
