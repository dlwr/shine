/**
 * ベルリン国際映画祭(金熊賞)取り込みのCLIエントリーポイント
 */
import {berlinConfig} from './berlin-film-festival';
import {runImdbEventAwardCli} from './common/imdb-event-award-cli';

await runImdbEventAwardCli({
  name: 'berlin-film-festival',
  festivalLabel: 'ベルリン映画祭',
  dataFileName: 'berlin-golden-bear.json',
  firstYear: 1951,
  config: berlinConfig,
});
