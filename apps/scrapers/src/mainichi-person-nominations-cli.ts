import {type Command} from 'commander';
import {
  importMainichiPersonNominations,
  MAINICHI_NOMINATION_ARTICLES,
} from './mainichi-person-nominations';
import {createAwardImportCommand} from './common/award-import-cli';

export function createCommand(): Command {
  return createAwardImportCommand({
    name: 'mainichi-person-nominations',
    description: [
      '日本語版Wikipediaの毎日映画コンクールの部門別記事（男優主演賞など）から',
      '演技賞のノミネートを取り込みます。ノミネートの表がある年度だけが対象で、',
      '受賞者は表の背景色で判定します。作品の同定と人物の引き当ては',
      'japan-person-awards と同じ経路です。',
    ],
    firstYear: 1946,
    yearDescription: '取り込む年度を1つに絞る',
    awards: MAINICHI_NOMINATION_ARTICLES,
    importAwards: importMainichiPersonNominations,
  });
}
