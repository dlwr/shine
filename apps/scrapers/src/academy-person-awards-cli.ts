/**
 * アカデミー賞の個人賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {
  ACADEMY_PERSON_AWARDS,
  importAcademyPersonAwards,
} from './academy-person-awards';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'academy-person-awards',
    description: [
      '英語版Wikipediaの「Academy Award for Best Director」などから個人賞を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      'その映画のクレジットから人物を引き当てて1人1行で保存します。',
    ],
    firstYear: 1929,
    yearDescription: '取り込む授賞式の年を1つに絞る',
    awards: ACADEMY_PERSON_AWARDS,
    importAwards: importAcademyPersonAwards,
  });
}
