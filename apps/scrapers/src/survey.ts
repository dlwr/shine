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

export async function measurePages(
  baseUrl: string,
  paths: string[],
  rounds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<PageTiming[][]> {
  const results: PageTiming[][] = [];

  for (let round = 0; round < rounds; round++) {
    const timings: PageTiming[] = [];
    for (const pagePath of paths) {
      const started = performance.now();
      const response = await fetchImpl(`${baseUrl}${pagePath}`, {
        redirect: 'manual',
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
