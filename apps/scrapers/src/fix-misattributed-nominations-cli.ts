/**
 * リメイクや同名別作品に誤って紐づいたノミネーションを正しい映画へ付け替えるCLI
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  fixMisattributedNominations,
  type MisattributedNomination,
} from './fix-misattributed-nominations';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataFilePath = path.resolve(
  currentDirectory,
  '../data/misattributed-nominations.json',
);

async function loadEntries(): Promise<MisattributedNomination[]> {
  const raw = await fs.readFile(dataFilePath, 'utf8');
  const parsed = JSON.parse(raw) as Array<
    Omit<MisattributedNomination, 'correctImdbId' | 'specialMention'> & {
      correctImdbId: string | null;
      specialMention?: string | null;
    }
  >;

  return parsed.map(entry => ({
    ...entry,
    correctImdbId: entry.correctImdbId ?? undefined,
    specialMention: entry.specialMention ?? undefined,
  }));
}

const program = new Command();

program
  .name('fix-misattributed-nominations')
  .description(
    [
      'data/misattributed-nominations.json の定義に従って、',
      'リメイクや同名別作品に誤紐付けされたノミネーションを正しい映画へ付け替えます。',
      '正しい映画がDBに無ければTMDbから作成し、ソフト削除されていれば復活させます。',
    ].join('\n'),
  )
  .option('--dry-run', '書き込みは行わず、対象のみ表示', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:fix-misattributed-nominations --dry-run
  pnpm run scrapers:fix-misattributed-nominations
`,
  )
  .action(async (options: {dryRun: boolean}) => {
    assertDatabaseEnvironment(environment);

    const entries = await loadEntries();
    console.log(`修正定義: ${entries.length}件`);

    const stats = await fixMisattributedNominations({
      environment,
      entries,
      dryRun: options.dryRun,
      throttleMs: 250,
    });

    console.log('\n結果:');
    console.log(`  付け替え: ${stats.repointed}`);
    console.log(`  重複削除: ${stats.deletedDuplicate}`);
    console.log(`  映画作成: ${stats.moviesCreated}`);
    console.log(`  映画復活: ${stats.moviesRevived}`);
    console.log(`  対象なし: ${stats.skipped}`);
    console.log(`  失敗: ${stats.failed}`);

    if (stats.affectedMovieUids.length > 0) {
      console.log('\nキャッシュ無効化が必要な映画UID:');
      for (const uid of stats.affectedMovieUids) {
        console.log(`  ${uid}`);
      }
    }

    if (stats.failed > 0) {
      process.exitCode = 1;
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('修正処理中にエラーが発生しました:', error);
  process.exitCode = 1;
}
