import {describe, expect, it} from 'vitest';
import headers from '../../public/_headers?raw';

function cacheControlFor(pattern: string): string | undefined {
  let current: string | undefined;
  for (const line of headers.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }

    if (!/^\s/.test(line)) {
      current = line.trim();
      continue;
    }

    const [name, ...value] = line.trim().split(':');
    if (current === pattern && name.toLowerCase() === 'cache-control') {
      return value.join(':').trim();
    }
  }

  return undefined;
}

describe('public/_headers', () => {
  it('ハッシュ付きの /assets/* は再検証させない', () => {
    expect(cacheControlFor('/assets/*')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('ファイル名にハッシュの無い /fonts/* は 30 日で再検証する', () => {
    expect(cacheControlFor('/fonts/*')).toBe('public, max-age=2592000');
  });
});
