/**
 * 報知映画賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';
import {importHochiFilmAwards} from './hochi-film-awards';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'hochi-film-awards',
    description: [
      '日本語版Wikipediaの「報知映画賞」から作品賞・',
      '作品賞・海外部門を取り込みます。',
    ],
    firstYear: 1976,
    importAwards: importHochiFilmAwards,
  });
}
