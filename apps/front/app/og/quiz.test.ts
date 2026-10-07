import {beforeEach, describe, expect, it, vi} from 'vitest';
import {renderQuizCard} from './quiz';
import {createMockContext} from '@/lib/test-context';

vi.mock('@/og/render/image-response', () => ({
  createImageResponse: vi.fn(
    async () => new Response(new Uint8Array([1]), {status: 200}),
  ),
}));

vi.mock('@/og/render/assets', () => ({
  fetchPosterAsDataUri: vi.fn(async () => 'data:image/png;base64,AA=='),
  loadGoogleFont: vi.fn(async () => new ArrayBuffer(1)),
}));

vi.stubGlobal('fetch', vi.fn());

const TODAY = '2026-08-17';

function stubApi() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/quiz/daily') {
      const date = url.searchParams.get('date');
      if (date && date > TODAY) {
        return new Response('{}', {status: 400});
      }

      return Response.json({date: date ?? TODAY, poolSize: 100});
    }

    return Response.json({
      posterUrl: 'https://image.tmdb.org/t/p/w500/a.jpg',
      focalX: 0.5,
      focalY: 0.5,
    });
  });
}

function requestedPaths(): string[] {
  return vi.mocked(fetch).mock.calls.map(([input]) => {
    const url = new URL(String(input));
    return `${url.pathname}${url.search}`;
  });
}

async function render(query: string) {
  return renderQuizCard(
    new Request(`http://localhost:3000/og/quiz.png${query}`),
    createMockContext('http://localhost:8787', {QUIZ_ANSWER_KEY: 'key'}),
  );
}

describe('renderQuizCard', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    stubApi();
  });

  it('日付が付いていればその日の出題で描く', async () => {
    await render('?date=2026-08-16');

    expect(requestedPaths()).toEqual([
      '/quiz/daily?date=2026-08-16',
      '/quiz/answer?date=2026-08-16',
    ]);
  });

  it('日付が無ければ当日の出題で描く', async () => {
    await render('');

    expect(requestedPaths()).toEqual([
      '/quiz/daily',
      `/quiz/answer?date=${TODAY}`,
    ]);
  });

  it('APIが受け付けない日付なら当日の出題で描く', async () => {
    const response = await render('?date=2026-08-18');

    expect(response.status).toBe(200);
    expect(requestedPaths().slice(1)).toEqual([
      '/quiz/daily',
      `/quiz/answer?date=${TODAY}`,
    ]);
  });
});
