/**
 * キネマ旬報ベスト・テン取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {createFilmAwardCommand} from './common/ja-wikipedia-film-award-cli';
import {importKinemaJunpo} from './kinema-junpo';

export function createCommand(): Command {
  return createFilmAwardCommand({
    name: 'kinema-junpo',
    description: [
      '日本語版Wikipediaの「キネマ旬報」からベスト・テンを取り込みます。',
    ],
    firstYear: 1924,
    importAwards: importKinemaJunpo,
  });
}
