import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Route} from './+types/now';
import {loader} from './now';
import {createEnvironmentContext} from '@/lib/api';

const context = createEnvironmentContext({
  PUBLIC_API_URL: 'https://api.example',
});

function runLoader(): Promise<Response> {
  return loader({
    context,
    request: new Request('https://shine-film.com/now'),
    params: {},
    matches: [],
  } as unknown as Route.LoaderArgs);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('/now', () => {
  it('今月の1本の映画ページへ転送する', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date('2026-09-18T05:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({monthly: {uid: 'm1'}})),
    );

    const response = await runLoader();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/movies/m1');
  });

  it('月が切り替わったあとも古い映画へ転送し続けないようにする', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date('2026-09-30T23:50:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({monthly: {uid: 'm1'}})),
    );

    const response = await runLoader();

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=600');
  });

  it('選出が取れなければアーカイブへ逃がし、その転送は残さない', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const response = await runLoader();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/monthly');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
