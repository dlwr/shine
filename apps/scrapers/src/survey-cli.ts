/**
 * 「なんかやろう」の前に毎回やっていた計測をまとめて流す。
 * 本番の TTFB・Turso の読み取り量・今月の北極星・大きいソースファイル・直近のコミット。
 */
import {execFile} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {Command, InvalidArgumentError} from 'commander';
import {getDatabase} from '@shine/database';
import {parseOriginRules} from '@shine/utils';
import {
  loadEnvironmentFiles,
  loadScraperEnvironment,
} from './common/environment';
import {fetchHatenaBookmarkCountsOrUndefined} from './hatena-bookmarks';
import {
  collectMonthlyLinkCounts,
  formatNorthStarReport,
  moviePageUrl,
} from './north-star';
import {
  collectSourceFileSizes,
  formatPageTimings,
  formatSurveyReport,
  largestSourceFiles,
  measurePages,
  settleSection,
  SURVEY_PAGES,
  type SurveySection,
} from './survey';
import {billingCycle, evaluateTursoUsage, fetchRowsRead} from './turso-usage';

const DAY_MS = 86_400_000;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const execFileAsync = promisify(execFile);

type SurveyOptions = {
  rounds: number;
  top: number;
  network: boolean;
  turso: boolean;
  northStar: boolean;
};

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError('1 以上の整数を指定してください');
  }

  return parsed;
}

function siteUrl(): string {
  return process.env.SHINE_SITE_URL ?? 'https://shine-film.com';
}

function apiUrl(): string {
  return process.env.SHINE_API_URL ?? 'https://shine-api.yuta25.workers.dev';
}

async function fetchMonthlyPickPath(): Promise<string | undefined> {
  const response = await fetch(`${apiUrl()}/?locale=ja`, {
    headers: {Origin: siteUrl()},
  });

  if (!response.ok) {
    return undefined;
  }

  const {monthly} = (await response.json()) as {monthly?: {uid?: string}};
  return monthly?.uid ? `/movies/${monthly.uid}` : undefined;
}

async function pageTimingsSection(rounds: number): Promise<SurveySection> {
  const monthlyPickPath = await fetchMonthlyPickPath();
  const pages = monthlyPickPath
    ? [...SURVEY_PAGES, monthlyPickPath]
    : SURVEY_PAGES;
  const timings = await measurePages(siteUrl(), pages, rounds);

  return {
    title: `本番 TTFB（${siteUrl()}、${rounds} ラウンド。1 回目は colo の KV が冷えていることがある）`,
    body: formatPageTimings(timings),
  };
}

async function tursoSection(): Promise<SurveySection> {
  const token = process.env.TURSO_PLATFORM_API_TOKEN || '';

  if (!token) {
    return {
      title: 'Turso 読み取り',
      body: 'TURSO_PLATFORM_API_TOKEN 未設定のためスキップ',
    };
  }

  const credentials = {
    token,
    organization: process.env.TURSO_ORGANIZATION || 'dlwr',
  };
  const now = new Date();
  const {start} = billingCycle(now);
  const [last24hRowsRead, monthToDateRowsRead] = await Promise.all([
    fetchRowsRead(credentials, new Date(now.getTime() - DAY_MS), now),
    fetchRowsRead(credentials, start, now),
  ]);
  const {alerts, summary} = evaluateTursoUsage({
    last24hRowsRead,
    monthToDateRowsRead,
    now,
  });

  return {
    title: 'Turso 読み取り',
    body: [summary, ...alerts.map(alert => `⚠️ ${alert}`)].join('\n'),
  };
}

async function northStarSection(): Promise<SurveySection> {
  const environment = loadScraperEnvironment();
  const counts = await collectMonthlyLinkCounts(
    getDatabase(environment),
    parseOriginRules(process.env),
    {months: 3},
  );

  const bookmarkCounts = await fetchHatenaBookmarkCountsOrUndefined(
    counts.map(count => moviePageUrl(count.movieUid)),
  );

  return {
    title: '北極星（直近 3 か月）',
    body: formatNorthStarReport(counts, new Date(), bookmarkCounts).content,
  };
}

async function sourceFilesSection(top: number): Promise<SurveySection> {
  const sizes = await collectSourceFileSizes(REPOSITORY_ROOT);
  const largest = largestSourceFiles(sizes, top);
  const width = Math.max(...largest.map(file => String(file.lines).length));

  return {
    title: `大きいソースファイル（上位 ${top}、テスト・生成物を除く）`,
    body: largest
      .map(file => `${String(file.lines).padStart(width)}  ${file.path}`)
      .join('\n'),
  };
}

async function recentCommitsSection(): Promise<SurveySection> {
  const {stdout} = await execFileAsync(
    'git',
    ['log', '-n', '15', '--format=%as %s', 'main'],
    {cwd: REPOSITORY_ROOT},
  );

  return {title: 'main の直近 15 コミット', body: stdout.trim()};
}

async function main(options: SurveyOptions): Promise<void> {
  loadEnvironmentFiles();
  const sections: SurveySection[] = [];

  if (options.network) {
    sections.push(
      await settleSection('本番 TTFB', async () =>
        pageTimingsSection(options.rounds),
      ),
    );
  }

  if (options.turso) {
    sections.push(await settleSection('Turso 読み取り', tursoSection));
  }

  if (options.northStar) {
    sections.push(
      await settleSection('北極星（直近 3 か月）', northStarSection),
    );
  }

  sections.push(
    await settleSection('大きいソースファイル', async () =>
      sourceFilesSection(options.top),
    ),
    await settleSection('main の直近 15 コミット', recentCommitsSection),
  );

  console.log(formatSurveyReport(sections));
}

export function createCommand(): Command {
  return new Command()
    .name('survey')
    .description(
      [
        '「なんかやろう」の前の定点計測をまとめて流します。',
        '本番の TTFB・Turso の読み取り量・北極星・大きいソースファイル・直近のコミットを出します。',
      ].join('\n'),
    )
    .option(
      '--rounds <N>',
      '本番ページを叩く回数 (default: 3)',
      parsePositiveInteger,
      3,
    )
    .option(
      '--top <N>',
      '大きいソースファイルの件数 (default: 15)',
      parsePositiveInteger,
      15,
    )
    .option('--no-network', '本番ページの計測を省く')
    .option('--no-turso', 'Turso の読み取り量を省く')
    .option('--no-north-star', '北極星の集計を省く')
    .addHelpText(
      'after',
      `
Examples:
  pnpm scrapers survey
  pnpm scrapers survey --rounds 2 --no-turso

Environment variables:
  SHINE_SITE_URL                 計測するサイト (default: https://shine-film.com)
  SHINE_API_URL                  今月の1本を引く API (default: https://shine-api.yuta25.workers.dev)
  TURSO_PLATFORM_API_TOKEN       Turso Platform API トークン（無ければ Turso の節をスキップ）
  NORTH_STAR_OWNER_IPS           本人の投稿とみなす IP (カンマ区切り)
  NORTH_STAR_OWNER_URL_PREFIXES  本人の投稿とみなす URL の接頭辞 (カンマ区切り)
`,
    )
    .action(main);
}
