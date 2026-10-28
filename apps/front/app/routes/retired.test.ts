import {describe, expect, it} from 'vitest';
import type {Route} from './+types/retired';
import {loader} from './retired';

function locationFor(path: string): string | null {
  const response = loader({
    request: new Request(`https://shine-film.com${path}`),
  } as unknown as Route.LoaderArgs);
  return response.headers.get('Location');
}

describe('取り下げたページ', () => {
  it.each([
    ['/crossings', '/awards'],
    ['/uncrowned', '/awards'],
    ['/people/crossings', '/people'],
    ['/people/uncrowned', '/people'],
  ])('%s を %s へ転送する', (path, destination) => {
    expect(locationFor(path)).toBe(destination);
  });
});
