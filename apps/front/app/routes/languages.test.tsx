import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import LanguagesPage, {loader} from './languages';
import type {Route} from './+types/languages';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const cast = <T,>(value?: unknown): T => value as T;

describe('languages', () => {
  it('言語名とその言語のページへのリンクを出す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{code: 'fa', movieCount: 51}],
    } as Response);
    const loaderData = await loader(
      cast<Route.LoaderArgs>({
        context: createMockContext(),
        request: new Request('http://localhost/languages'),
        params: {},
        matches: [],
      }),
    );

    render(
      <LanguagesPage
        {...cast<Route.ComponentProps>({loaderData, params: {}, matches: []})}
      />,
    );

    expect(screen.getByRole('link', {name: /ペルシア語/})).toHaveAttribute(
      'href',
      '/languages/fa',
    );
  });
});
