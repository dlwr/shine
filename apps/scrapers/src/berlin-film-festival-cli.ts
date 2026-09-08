/**
 * ベルリン国際映画祭(金熊賞)取り込みのCLIエントリーポイント
 */
import {type Command} from 'commander';
import {berlinConfig} from './berlin-film-festival';
import {createImdbEventAwardCommand} from './common/imdb-event-award-cli';

export function createCommand(): Command {
  return createImdbEventAwardCommand({
    name: 'berlin-film-festival',
    festivalLabel: 'ベルリン映画祭',
    dataFileName: 'berlin-golden-bear.json',
    firstYear: 1951,
    config: berlinConfig,
  });
}
