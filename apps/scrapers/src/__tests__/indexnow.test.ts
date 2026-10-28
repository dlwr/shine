import {readFileSync} from 'node:fs';
import {INDEXNOW_KEY} from '@shine/utils/indexnow';
import {describe, expect, it} from 'vitest';
import {buildIndexNowUrls} from '../indexnow';

const selections = {
  daily: {uid: 'daily-uid'},
  weekly: {uid: 'weekly-uid'},
  monthly: {uid: 'monthly-uid'},
};

describe('buildIndexNowUrls', () => {
  it('毎日ホームを出す', () => {
    const urls = buildIndexNowUrls(selections, '2026-09-17');

    expect(urls).toContain('https://shine-film.com/');
  });

  it('毎日その日の日替わりの映画ページを出す', () => {
    const urls = buildIndexNowUrls(selections, '2026-09-17');

    expect(urls).toContain('https://shine-film.com/movies/daily-uid');
  });

  it('週替わりが切り替わらない日は週替わりの映画ページを出さない', () => {
    const urls = buildIndexNowUrls(selections, '2026-09-17');

    expect(urls).not.toContain('https://shine-film.com/movies/weekly-uid');
  });

  it('金曜は週替わりの映画ページを出す', () => {
    const urls = buildIndexNowUrls(selections, '2026-09-18');

    expect(urls).toContain('https://shine-film.com/movies/weekly-uid');
  });

  it('月初でない日は月替わりの映画ページを出さない', () => {
    const urls = buildIndexNowUrls(selections, '2026-09-17');

    expect(urls).not.toContain('https://shine-film.com/movies/monthly-uid');
  });

  it('1日は月替わりの映画ページを出す', () => {
    const urls = buildIndexNowUrls(selections, '2026-10-01');

    expect(urls).toContain('https://shine-film.com/movies/monthly-uid');
  });

  it('同じ映画が複数の枠に選ばれても1回だけ出す', () => {
    const urls = buildIndexNowUrls(
      {daily: {uid: 'same-uid'}, monthly: {uid: 'same-uid'}},
      '2026-10-01',
    );

    expect(
      urls.filter(url => url === 'https://shine-film.com/movies/same-uid'),
    ).toHaveLength(1);
  });

  it('選出が取れていない枠は飛ばす', () => {
    const urls = buildIndexNowUrls({}, '2026-10-01');

    expect(urls).toStrictEqual(['https://shine-film.com/']);
  });
});

describe('鍵ファイル', () => {
  it('front の public に鍵と同じ名前・中身で置いてある', () => {
    const content = readFileSync(
      `apps/front/public/${INDEXNOW_KEY}.txt`,
      'utf8',
    );

    expect(content.trim()).toBe(INDEXNOW_KEY);
  });
});
