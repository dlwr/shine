import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {Command} from 'commander';
import {buildD1ImportStatements} from './d1-import-sql';

async function main(options: {from: string; out: string}): Promise<void> {
  const client = createClient({url: `file:${path.resolve(options.from)}`});
  try {
    const statements = await buildD1ImportStatements(client);
    const outputPath = path.resolve(options.out);
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, `${statements.join(';\n')};\n`);
    console.log(`${outputPath}: ${statements.length} 文`);
    console.log(
      `流す: pnpm wrangler d1 execute <DB 名> --remote --file ${outputPath} --yes`,
    );
  } finally {
    client.close();
  }
}

export function createCommand(): Command {
  return new Command()
    .name('d1-import-sql')
    .description(
      'SQLite ファイル（database-backup の出力など）を D1 に流す SQL にします',
    )
    .requiredOption('--from <path>', '元の SQLite ファイル')
    .requiredOption('--out <path>', '書き出す SQL ファイル')
    .addHelpText(
      'after',
      `
空の D1 に流すこと。テーブル・行・FTS の中身・索引・トリガーの順に並ぶ。

Examples:
  pnpm scrapers d1-import-sql --from tmp/backups/shine-2026-09-25.db --out tmp/d1-import/shine.sql
`,
    )
    .action(main);
}
