/**
 * 日本アカデミー賞の個人賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {
  JAPAN_ACADEMY_PERSON_AWARDS,
  importJapanAcademyPersonAwards,
} from './japan-academy-person-awards';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'japan-academy-person-awards',
    description: [
      '日本語版Wikipediaの「日本アカデミー賞監督賞」などから個人賞を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      'その映画のクレジットから人物を引き当てて1人1行で保存します。',
      '最優秀賞は優秀賞の中から選ばれるので、受賞として保存します。',
    ],
    firstYear: 1978,
    yearDescription: '取り込む授賞式の年を1つに絞る',
    awards: JAPAN_ACADEMY_PERSON_AWARDS,
    importAwards: importJapanAcademyPersonAwards,
  });
}
