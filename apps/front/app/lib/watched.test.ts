import {beforeEach, describe, expect, it} from 'vitest';
import {
  buildWatchedShareLine,
  buildWatchedShareText,
  decodeWatched,
  encodeWatched,
  isWatchedEncoding,
  mergeWatched,
  orderWinners,
  readWatched,
  toggleWatched,
  WATCHED_STORAGE_KEY,
  watchedStats,
  writeWatched,
} from './watched';

const AWARD = {
  years: [
    {
      year: 2023,
      movies: [{uid: 'uid-c', title: '落下の解剖学', isWinner: true}],
    },
    {
      year: 2021,
      movies: [
        {uid: 'uid-b', title: 'チタン', isWinner: true},
        {uid: 'uid-a', title: 'ドライブ・マイ・カー', isWinner: true},
      ],
    },
    {year: 2020, movies: []},
  ],
};

describe('orderWinners', () => {
  it('授賞式年の昇順、同じ年は uid の昇順に並べる', () => {
    expect(orderWinners(AWARD).map(film => film.uid)).toEqual([
      'uid-a',
      'uid-b',
      'uid-c',
    ]);
  });

  it('授賞式年と題名を持ち回る', () => {
    expect(orderWinners(AWARD)[2]).toEqual({
      uid: 'uid-c',
      title: '落下の解剖学',
      year: 2023,
    });
  });

  it('受賞していない作品は含めない', () => {
    const award = {
      years: [
        {
          year: 2023,
          movies: [
            {uid: 'uid-w', title: 'Winner', isWinner: true},
            {uid: 'uid-n', title: 'Nominee', isWinner: false},
          ],
        },
      ],
    };

    expect(orderWinners(award).map(film => film.uid)).toEqual(['uid-w']);
  });
});

describe('encodeWatched / decodeWatched', () => {
  const order = Array.from({length: 11}, (_, index) => `uid-${index}`);

  it('バージョン接頭辞付きの base64url で往復する', () => {
    const watched = new Set(['uid-0', 'uid-7', 'uid-10']);
    const encoded = encodeWatched(order, watched);

    expect(encoded).toMatch(/^3\.[\w-]+$/);
    expect(decodeWatched(order, encoded)).toEqual(watched);
  });

  it('リストに無い uid は符号化に影響しない', () => {
    expect(encodeWatched(order, new Set(['other']))).toBe(
      encodeWatched(order, new Set()),
    );
  });

  it('11本は2バイト（3文字）に収まる', () => {
    expect(encodeWatched(order, new Set(order))).toHaveLength('3.'.length + 3);
  });

  it('リストの末尾に映画が増えても古い符号を読める', () => {
    const encoded = encodeWatched(order, new Set(['uid-10']));
    const grown = [...order, 'uid-11', 'uid-12'];

    expect(decodeWatched(grown, encoded)).toEqual(new Set(['uid-10']));
  });

  it('壊れた値や未知のバージョンは空集合にする', () => {
    expect(decodeWatched(order, '')).toEqual(new Set());
    expect(decodeWatched(order, undefined)).toEqual(new Set());
    expect(decodeWatched(order, '2.AAA')).toEqual(new Set());
    expect(decodeWatched(order, '3.???')).toEqual(new Set());
  });
});

describe('watchedStats', () => {
  it('本数と割合を返す', () => {
    expect(
      watchedStats(['a', 'b', 'c', 'd'], new Set(['a', 'c', 'zzz'])),
    ).toEqual({total: 4, count: 2, percent: 50});
  });

  it('空のリストは 0% にする', () => {
    expect(watchedStats([], new Set())).toEqual({
      total: 0,
      count: 0,
      percent: 0,
    });
  });

  it('割合は四捨五入する', () => {
    expect(watchedStats(['a', 'b', 'c'], new Set(['a'])).percent).toBe(33);
  });
});

describe('buildWatchedShareText', () => {
  it('見出しと成績と URL を並べる', () => {
    expect(
      buildWatchedShareText({
        heading: 'カンヌ国際映画祭 パルム・ドール',
        total: 48,
        count: 23,
        percent: 48,
        url: 'https://shine-film.com/watched/palme-dor?s=3.abc',
      }),
    ).toBe(
      'カンヌ国際映画祭 パルム・ドールの受賞作、48本中23本観てた（48%）\nhttps://shine-film.com/watched/palme-dor?s=3.abc',
    );
  });
});

describe('buildWatchedShareLine', () => {
  it('URL 無しの1行を返す', () => {
    expect(
      buildWatchedShareLine({
        heading: 'アカデミー賞 作品賞',
        total: 99,
        count: 40,
        percent: 40,
      }),
    ).toBe('アカデミー賞 作品賞の受賞作、99本中40本観てた（40%）');
  });
});

describe('isWatchedEncoding', () => {
  it('バージョン接頭辞付きの base64url だけを通す', () => {
    expect(isWatchedEncoding('3.AQ')).toBe(true);
    expect(isWatchedEncoding('3.a-_Z')).toBe(true);
    expect(isWatchedEncoding('2.AQ')).toBe(false);
    expect(isWatchedEncoding('3.')).toBe(false);
    expect(isWatchedEncoding('3.a+b')).toBe(false);
    expect(isWatchedEncoding(undefined)).toBe(false);
  });
});

describe('mergeWatched / toggleWatched', () => {
  it('和集合を返す', () => {
    expect(mergeWatched(new Set(['a']), new Set(['a', 'b']))).toEqual(
      new Set(['a', 'b']),
    );
  });

  it('無ければ足し、有れば外す', () => {
    const once = toggleWatched(new Set(['a']), 'b');
    expect(once).toEqual(new Set(['a', 'b']));
    expect(toggleWatched(once, 'a')).toEqual(new Set(['b']));
  });
});

describe('readWatched / writeWatched', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存した集合を読み戻す', () => {
    writeWatched(new Set(['a', 'b']));

    expect(readWatched()).toEqual(new Set(['a', 'b']));
    expect(JSON.parse(localStorage.getItem(WATCHED_STORAGE_KEY) ?? '')).toEqual(
      {uids: ['a', 'b']},
    );
  });

  it('未保存や壊れた値は空集合にする', () => {
    expect(readWatched()).toEqual(new Set());

    localStorage.setItem(WATCHED_STORAGE_KEY, '{broken');
    expect(readWatched()).toEqual(new Set());
  });
});
