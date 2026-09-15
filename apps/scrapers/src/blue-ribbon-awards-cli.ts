/**
 * ブルーリボン賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {importBlueRibbonAwards} from './blue-ribbon-awards';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'blue-ribbon-awards',
    description: [
      '日本語版Wikipediaの「ブルーリボン賞 (映画)」から作品賞・',
      '外国作品賞を取り込みます。',
    ],
    firstYear: 1950,
    importAwards: importBlueRibbonAwards,
  });
}
