/**
 * TMDb へ日本語ポスターを投稿するためのワークリストを出すCLI
 */
import {Command} from 'commander';
import {integerAtLeast} from './common/cli-options';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {findJaPosterCandidates} from './ja-posters';

export function createCommand(): Command {
  return new Command()
    .name('ja-poster-worklist')
    .description(
      [
        '邦題があり日本語ポスターの無い外国映画を、今月の選出 → 受賞作 → その他の順に JSON で出します。',
        'TMDb のポスター投稿画面と映画.com の検索の URL を載せます。書き込みは行いません。',
      ].join('\n'),
    )
    .option('--limit <count>', '出す件数の上限', integerAtLeast(1, 'limit'), 10)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers ja-poster-worklist
  pnpm scrapers ja-poster-worklist --limit 30
`,
    )
    .action(async (options: {limit: number}) => {
      try {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        assertDatabaseEnvironment(environment);

        const candidates = await findJaPosterCandidates({
          environment,
          today: new Date().toISOString().slice(0, 10),
        });
        const items = candidates.slice(0, options.limit).map(candidate => ({
          ...candidate,
          shineUrl: `https://shine-film.com/movies/${candidate.uid}`,
          tmdbPostersUrl: `https://www.themoviedb.org/${candidate.mediaType}/${candidate.tmdbId}/images/posters`,
          eigaSearchUrl: `https://eiga.com/search/${encodeURIComponent(candidate.jaTitle)}/`,
        }));

        console.log(JSON.stringify(items, undefined, 2));
        console.error(`候補: ${candidates.length}件中 ${items.length}件を出力`);
      } catch (error) {
        console.error('ワークリスト生成中にエラーが発生しました:', error);
        process.exitCode = 1;
      }
    });
}
