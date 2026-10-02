import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

export type PageTiming = {path: string; status: number; ttfbMs: number};
export type SourceFileSize = {path: string; lines: number};
export type SurveySection = {title: string; body: string};

export const SURVEY_PAGES = [
  '/',
  '/quiz',
  '/awards',
  '/people',
  '/years',
  '/daily',
  '/people/crossings',
  '/watched',
];

const SOURCE_ROOTS = new Set(['apps', 'packages']);
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'build',
  'dist',
  '__tests__',
  '.react-router',
]);

export function isSurveySourceFile(relativePath: string): boolean {
  const segments = relativePath.split('/');
  const fileName = segments.at(-1) ?? '';

  if (!SOURCE_ROOTS.has(segments[0])) {
    return false;
  }

  if (segments.some(segment => EXCLUDED_DIRECTORIES.has(segment))) {
    return false;
  }

  if (!/\.tsx?$/.test(fileName)) {
    return false;
  }

  return !/\.(test|spec|d)\.tsx?$/.test(fileName);
}

export function largestSourceFiles(
  files: SourceFileSize[],
  limit: number,
): SourceFileSize[] {
  return files.toSorted((a, b) => b.lines - a.lines).slice(0, limit);
}

async function walk(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const found: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        found.push(...(await walk(root, absolute)));
      }
    } else if (isSurveySourceFile(relative)) {
      found.push(relative);
    }
  }

  return found;
}

export async function collectSourceFileSizes(
  root: string,
): Promise<SourceFileSize[]> {
  const sizes: SourceFileSize[] = [];

  for (const sourceRoot of SOURCE_ROOTS) {
    const files = await walk(root, path.join(root, sourceRoot));
    for (const file of files) {
      const content = await readFile(path.join(root, file), 'utf8');
      sizes.push({path: file, lines: content.split('\n').length});
    }
  }

  return sizes;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const CONNECTION_PRIMING_PATH = '/favicon.svg';

export async function measurePages(
  baseUrl: string,
  paths: string[],
  rounds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<PageTiming[][]> {
  const results: PageTiming[][] = [];

  const priming = await fetchImpl(`${baseUrl}${CONNECTION_PRIMING_PATH}`, {
    headers: {'user-agent': BROWSER_USER_AGENT},
  });
  await priming.arrayBuffer();

  for (let round = 0; round < rounds; round++) {
    const timings: PageTiming[] = [];
    for (const pagePath of paths) {
      const started = performance.now();
      const response = await fetchImpl(`${baseUrl}${pagePath}`, {
        redirect: 'manual',
        headers: {'user-agent': BROWSER_USER_AGENT},
      });
      const ttfbMs = performance.now() - started;
      await response.arrayBuffer();
      timings.push({path: pagePath, status: response.status, ttfbMs});
    }

    results.push(timings);
  }

  return results;
}

export function formatPageTimings(rounds: PageTiming[][]): string {
  const [first = []] = rounds;
  const pathWidth = Math.max(...first.map(timing => timing.path.length), 0);

  return first
    .map((timing, index) => {
      const cells = rounds.map(round =>
        `${Math.round(round[index]?.ttfbMs ?? 0)}ms`.padStart(8),
      );
      return `${timing.path.padEnd(pathWidth)}  ${timing.status}${cells.join('')}`;
    })
    .join('\n');
}

export function formatSurveyReport(sections: SurveySection[]): string {
  return sections
    .map(section => `## ${section.title}\n${section.body}`)
    .join('\n\n');
}

function failureReason(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.cause instanceof Error
    ? `${error.message}（${error.cause.message}）`
    : error.message;
}

export async function settleSection(
  title: string,
  build: () => Promise<SurveySection>,
): Promise<SurveySection> {
  try {
    return await build();
  } catch (error) {
    return {title, body: `取得に失敗: ${failureReason(error)}`};
  }
}

export type WorkflowRun = {
  workflowName: string;
  status: string;
  conclusion: string;
  createdAt: string;
  url: string;
};

function runOutcome(run: WorkflowRun): string {
  return run.status === 'completed' ? run.conclusion : run.status;
}

function isFailedRun(run: WorkflowRun): boolean {
  return ['failure', 'timed_out', 'startup_failure'].includes(runOutcome(run));
}

const RUN_URL_PATTERN =
  /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/g;

export function mentionedRunUrls(text: string): Set<string> {
  return new Set(text.match(RUN_URL_PATTERN));
}

export function formatWorkflowStatus(
  runs: WorkflowRun[],
  addressedRunUrls: ReadonlySet<string> = new Set(),
): string {
  const requiresAttention = (run: WorkflowRun) =>
    isFailedRun(run) && !addressedRunUrls.has(run.url);

  const latestByWorkflow = new Map<string, WorkflowRun>();

  for (const run of runs) {
    if (run.conclusion === 'skipped') {
      continue;
    }

    const latest = latestByWorkflow.get(run.workflowName);
    if (!latest || run.createdAt > latest.createdAt) {
      latestByWorkflow.set(run.workflowName, run);
    }
  }

  const latestRuns = latestByWorkflow
    .values()
    .toArray()
    .toSorted(
      (a, b) =>
        Number(requiresAttention(b)) - Number(requiresAttention(a)) ||
        a.workflowName.localeCompare(b.workflowName),
    );

  if (latestRuns.length === 0) {
    return 'run なし';
  }

  const nameWidth = Math.max(...latestRuns.map(run => run.workflowName.length));
  const outcomeWidth = Math.max(
    ...latestRuns.map(run => runOutcome(run).length),
  );

  return latestRuns
    .map(run => {
      const isAttention = requiresAttention(run);
      const cells = [
        `${isAttention ? '⚠️ ' : ''}${run.workflowName.padEnd(nameWidth)}`,
        runOutcome(run).padEnd(outcomeWidth),
        `${run.createdAt.slice(0, 10)} ${run.createdAt.slice(11, 16)}Z`,
        isAttention ? run.url : isFailedRun(run) ? '手当て済み' : undefined,
      ].filter(cell => cell !== undefined);
      return cells.join('  ');
    })
    .join('\n');
}
