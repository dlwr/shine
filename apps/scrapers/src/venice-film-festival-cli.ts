/**
 * ヴェネツィア国際映画祭(金獅子賞)取り込みのCLIエントリーポイント
 */
import {runImdbEventAwardCli} from './common/imdb-event-award-cli';
import {veniceConfig} from './venice-film-festival';

await runImdbEventAwardCli({
  name: 'venice-film-festival',
  festivalLabel: 'ヴェネツィア映画祭',
  dataFileName: 'venice-golden-lion.json',
  firstYear: 1932,
  config: veniceConfig,
});
