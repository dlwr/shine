import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {INDEXNOW_KEY} from '@shine/utils/indexnow';
import {describe, expect, it} from 'vitest';

const apiDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('IndexNow の鍵', () => {
  it('本番の wrangler.toml の INDEXNOW_KEY が鍵ファイルの鍵と一致する', () => {
    const wrangler = readFileSync(
      path.join(apiDirectory, 'wrangler.toml'),
      'utf8',
    );

    expect(wrangler).toContain(`INDEXNOW_KEY = "${INDEXNOW_KEY}"`);
  });
});
