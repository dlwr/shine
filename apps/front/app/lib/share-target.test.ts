import {describe, expect, it} from 'vitest';
import {sharedUrl} from './share-target';

describe('sharedUrl', () => {
  it('url の値を返す', () => {
    expect(
      sharedUrl(new URLSearchParams({url: 'https://example.com/post'})),
    ).toBe('https://example.com/post');
  });

  it('url が無ければ本文の中の URL を返す', () => {
    expect(
      sharedUrl(
        new URLSearchParams({text: 'さざなみを観た https://x.com/a/status/1'}),
      ),
    ).toBe('https://x.com/a/status/1');
  });

  it('http と https 以外は返さない', () => {
    expect(
      sharedUrl(new URLSearchParams({url: 'javascript:alert(1)'})),
    ).toBeUndefined();
  });

  it('URL が無ければ undefined', () => {
    expect(sharedUrl(new URLSearchParams({text: '観た'}))).toBeUndefined();
  });
});
