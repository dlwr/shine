/**
 * 日本アカデミー賞作品賞取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';
import {importJapanAcademyAwards} from './japan-academy-awards';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'japan-academy-awards',
    description: [
      '日本語版Wikipediaの「日本アカデミー賞作品賞」から優秀作品賞を取り込みます。',
      '最優秀作品賞は優秀作品賞の中から選ばれるので、受賞として保存します。',
    ],
    firstYear: 1978,
    yearUnit: '授賞式の年',
    async importAwards(options) {
      return {日本アカデミー賞: await importJapanAcademyAwards(options)};
    },
  });
}
