/**
 * 日刊スポーツ映画大賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';
import {importNikkanSportsFilmAwards} from './nikkan-sports-film-awards';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'nikkan-sports-film-awards',
    description: [
      '日本語版Wikipediaの「日刊スポーツ映画大賞・石原裕次郎賞」から',
      '作品賞・外国作品賞・石原裕次郎賞を取り込みます。',
    ],
    firstYear: 1988,
    importAwards: importNikkanSportsFilmAwards,
  });
}
