/**
 * 毎日映画コンクール取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';
import {importMainichiFilmConcours} from './mainichi-film-concours';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'mainichi-film-concours',
    description: [
      '日本語版Wikipediaの「毎日映画コンクール」から日本映画大賞・',
      '日本映画優秀賞・外国映画ベストワン賞を取り込みます。',
    ],
    firstYear: 1946,
    yearUnit: '年',
    importAwards: importMainichiFilmConcours,
  });
}
