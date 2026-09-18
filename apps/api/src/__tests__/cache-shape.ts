export type CacheShapeRecord = {
  key: string;
  shape: string[];
};

export type CacheShapeCheck =
  | {ok: true}
  | {
      ok: false;
      reason: 'missing' | 'version-not-bumped' | 'stale-record';
      message: string;
    };

export const UPDATE_COMMAND =
  'UPDATE_CACHE_SHAPES=1 pnpm vitest run --project node apps/api/src/__tests__/cache-key-version.test.ts';

export function normalizeCacheKey(key: string): string {
  return key.replaceAll(/\d{4}-\d{2}-\d{2}/g, '{date}');
}

function walk(value: unknown, path: string, paths: Set<string>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      paths.add(`${path}[] 空`);
      return;
    }

    for (const item of value) {
      walk(item, `${path}[]`, paths);
    }

    return;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(
      ([, property]) => property !== undefined,
    );
    if (entries.length === 0) {
      paths.add(`${path} {}`.trim());
      return;
    }

    for (const [key, property] of entries) {
      walk(property, path ? `${path}.${key}` : key, paths);
    }

    return;
  }

  paths.add(path);
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

export function describeShape(value: unknown): string[] {
  const paths = new Set<string>();
  walk(value, '', paths);
  return [...paths].toSorted(compareCodePoints);
}

function difference(before: string[], after: string[]): string {
  const removed = before.filter(path => !after.includes(path));
  const added = after.filter(path => !before.includes(path));
  return [
    ...removed.map(path => `- ${path}`),
    ...added.map(path => `+ ${path}`),
  ].join('\n');
}

export function checkCacheShape(
  recorded: CacheShapeRecord | undefined,
  current: CacheShapeRecord,
): CacheShapeCheck {
  if (!recorded) {
    return {
      ok: false,
      reason: 'missing',
      message: `${current.key} の記録が無い。${UPDATE_COMMAND} で記録する`,
    };
  }

  const sameShape =
    recorded.shape.length === current.shape.length &&
    recorded.shape.every((path, index) => path === current.shape[index]);

  if (sameShape && recorded.key === current.key) {
    return {ok: true};
  }

  if (!sameShape && recorded.key === current.key) {
    return {
      ok: false,
      reason: 'version-not-bumped',
      message: [
        `応答の形が変わったのに鍵の版が ${current.key} のまま。`,
        '古い形のキャッシュが残っている間、front には新旧が混ざって届く。',
        `鍵の版を上げてから ${UPDATE_COMMAND} で記録し直すこと。`,
        'テストデータを変えて形が変わっただけなら、記録から該当の鍵を消してから記録し直す。',
        difference(recorded.shape, current.shape),
      ].join('\n'),
    };
  }

  return {
    ok: false,
    reason: 'stale-record',
    message: [
      `記録が古い（記録 ${recorded.key} / 実際 ${current.key}）。`,
      `${UPDATE_COMMAND} で記録を更新すること。`,
      difference(recorded.shape, current.shape),
    ].join('\n'),
  };
}

const EMPTY_MARKER = /\s(空|\{\})$/;

/** 鍵が 1 か所だけ違うものを、同じ経路の別の入力とみなす */
function isSameEndpoint(a: string, b: string): boolean {
  const left = a.split(':');
  const right = b.split(':');
  if (left.length !== right.length) {
    return false;
  }

  return left.filter((segment, index) => segment !== right[index]).length <= 1;
}

/**
 * どの記録でも空のままで、中身の形を見張れていない配列・オブジェクトを返す。
 * 空でない記録が同じ経路に 1 つでもあれば見張れている。
 */
function isMonitoredSomewhere(
  record: Record<string, string[]>,
  key: string,
  emptyPath: string,
): boolean {
  const prefix = emptyPath.replace(EMPTY_MARKER, '');

  return Object.entries(record).some(
    ([otherKey, otherShape]) =>
      isSameEndpoint(key, otherKey) &&
      otherShape.some(
        entry =>
          entry === prefix ||
          entry.startsWith(`${prefix}.`) ||
          entry.startsWith(`${prefix}[`),
      ),
  );
}

export function unmonitoredEmptyPaths(
  record: Record<string, string[]>,
): string[] {
  const unmonitored: string[] = [];

  for (const [key, shape] of Object.entries(record)) {
    const emptyPaths = shape.filter(entry => EMPTY_MARKER.test(entry));
    unmonitored.push(
      ...emptyPaths
        .filter(path => !isMonitoredSomewhere(record, key, path))
        .map(path => `${key} の ${path}`),
    );
  }

  return unmonitored;
}
