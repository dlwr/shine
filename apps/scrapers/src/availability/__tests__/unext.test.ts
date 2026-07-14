import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {checkUnext, parseUnextTitles} from '../sources/unext';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureJson = fs.readFileSync(
  path.join(currentDirectory, 'fixtures/unext-search.json'),
  'utf8',
);

describe('parseUnextTitles', () => {
  it('extracts title names from the search response', () => {
    const titles = parseUnextTitles(JSON.parse(fixtureJson));
    expect(titles).toContain('ゴッドファーザー');
    expect(titles).toContain('東京ゴッドファーザーズ');
    expect(titles.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array for a response without results', () => {
    expect(
      parseUnextTitles({
        data: {webfront_videoFreewordSearch: {titles: []}},
      }),
    ).toEqual([]);
  });

  it('returns empty array for a malformed response', () => {
    expect(parseUnextTitles({})).toEqual([]);
  });
});

describe('checkUnext', () => {
  const fetchFixture = vi.fn(
    async () =>
      new Response(fixtureJson, {
        headers: {'Content-Type': 'application/json'},
      }),
  );

  it('returns ok when a search result matches a target title', async () => {
    const result = await checkUnext(['ゴッドファーザー'], fetchFixture);

    expect(result.status).toBe('ok');
    expect(result.source).toBe('unext');
  });

  it('sends the apollo client headers required by the persisted query list', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(fixtureJson, {
          headers: {'Content-Type': 'application/json'},
        }),
    );
    await checkUnext(['ゴッドファーザー'], fetchSpy);

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('apollographql-client-name')).toBe('cosmo');
    expect(headers.get('apollographql-client-version')).toBeTruthy();
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('cosmo_allFreewordSearch');
    expect(url).toContain(encodeURIComponent('ゴッドファーザー'));
  });

  it('returns ng when no result matches', async () => {
    const result = await checkUnext(['存在しない映画XYZ'], fetchFixture);

    expect(result.status).toBe('ng');
  });

  it('returns error when the API responds with GraphQL errors', async () => {
    const errorFetch = vi.fn(async () =>
      Response.json(
        {
          errors: [{message: 'PersistedQueryNotFound'}],
        },
        {headers: {'Content-Type': 'application/json'}},
      ),
    );

    const result = await checkUnext(['ゴッドファーザー'], errorFetch);

    expect(result.status).toBe('error');
    expect(result.detail).toContain('PersistedQueryNotFound');
  });

  it('returns error when the fetch fails', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('timeout');
    });

    const result = await checkUnext(['ゴッドファーザー'], failingFetch);

    expect(result.status).toBe('error');
  });
});
