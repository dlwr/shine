import {beforeEach, describe, expect, it, vi} from 'vitest';
import {renderQuizPoster} from './quiz-poster';
import {fetchPosterAsDataUri} from '@/og/render/assets';
import {createMockContext} from '@/lib/test-context';

vi.mock('@/og/render/image-response', () => ({
  createImageResponse: vi.fn(
    async () => new Response(new Uint8Array([1]), {status: 200}),
  ),
}));

vi.mock('@/og/render/assets', () => ({
  fetchPosterAsDataUri: vi.fn(),
}));

vi.stubGlobal('fetch', vi.fn());

const answer = {
  posterUrl: 'https://image.tmdb.org/t/p/w500/a.jpg',
  focalX: 0.5,
  focalY: 0.5,
};

async function render() {
  return renderQuizPoster(
    new Request(
      'http://localhost:3000/quiz/poster.png?date=2026-10-16&stage=1',
    ),
    createMockContext('http://localhost:8787', {QUIZ_ANSWER_KEY: 'key'}),
  );
}

describe('renderQuizPoster', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockImplementation(async () => Response.json(answer));
    vi.mocked(fetchPosterAsDataUri).mockReset();
    vi.mocked(fetchPosterAsDataUri).mockResolvedValue(
      'data:image/png;base64,AA==',
    );
  });

  it('答えの取得が一時的に失敗しても、もう一度取って描く', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', {status: 500}));

    const response = await render();

    expect(response.status).toBe(200);
  });

  it('答えの取得が続けて失敗したら、キャッシュさせない 503 を返す', async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response('', {status: 500}),
    );

    const response = await render();

    expect([response.status, response.headers.get('cache-control')]).toEqual([
      503,
      'no-store',
    ]);
  });

  it('API が受け付けない日付なら、もう一度取らずに 404 を返す', async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response('', {status: 400}),
    );

    const response = await render();

    expect([response.status, vi.mocked(fetch).mock.calls.length]).toEqual([
      404, 1,
    ]);
  });

  it('ポスターの取得が一時的に失敗しても、もう一度取って描く', async () => {
    vi.mocked(fetchPosterAsDataUri).mockResolvedValueOnce(undefined);

    const response = await render();

    expect(response.status).toBe(200);
  });

  it('ポスターの取得が続けて失敗したら、キャッシュさせない 503 を返す', async () => {
    vi.mocked(fetchPosterAsDataUri).mockResolvedValue(undefined);

    const response = await render();

    expect([response.status, response.headers.get('cache-control')]).toEqual([
      503,
      'no-store',
    ]);
  });
});
