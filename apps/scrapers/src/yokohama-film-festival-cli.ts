/**
 * ヨコハマ映画祭取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';
import {importYokohamaFilmFestival} from './yokohama-film-festival';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'yokohama-film-festival',
    description: [
      '日本語版Wikipediaの「ヨコハマ映画祭」から',
      '日本映画ベストテン（1位が作品賞）を取り込みます。',
    ],
    firstYear: 1979,
    importAwards: importYokohamaFilmFestival,
  });
}
