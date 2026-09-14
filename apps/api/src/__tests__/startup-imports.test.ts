import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, type Metafile} from 'esbuild';
import {describe, expect, it} from 'vitest';

const HEAVY_PACKAGES = ['iconv-lite', 'cheerio'];

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(currentDirectory, '../..');

async function bundleInputs(): Promise<Metafile['inputs']> {
  const result = await build({
    absWorkingDir: apiDirectory,
    entryPoints: ['src/index.ts'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'node',
    conditions: ['workerd', 'worker'],
    external: ['cloudflare:*'],
    logLevel: 'silent',
  });
  return result.metafile.inputs;
}

function staticallyReachable(
  inputs: Metafile['inputs'],
  entry: string,
): Set<string> {
  const reachable = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (reachable.has(file)) {
      continue;
    }

    reachable.add(file);
    const imports = inputs[file]?.imports ?? [];
    for (const imported of imports) {
      if (!imported.external && imported.kind !== 'dynamic-import') {
        pending.push(imported.path);
      }
    }
  }

  return reachable;
}

describe('API worker の起動時に評価するモジュール', () => {
  it('DISCAS の解析に使う重い依存は動的 import の先に置く', async () => {
    const inputs = await bundleInputs();
    const reachable = staticallyReachable(inputs, 'src/index.ts');

    const heavy = HEAVY_PACKAGES.filter(name =>
      [...reachable].some(file => file.includes(`node_modules/${name}/`)),
    );

    expect(heavy).toEqual([]);
  }, 30_000);
});
