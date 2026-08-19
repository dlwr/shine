import {describe, expect, it, vi} from 'vitest';
import {
  collectImplausibleResolutions,
  dropMisattributedResolutions,
  isPlausibleEditionYear,
  publicationYearFromClaims,
  type KinemaJunpoEdition,
  type ResolvedFilm,
} from '../kinema-junpo';

describe('publicationYearFromClaims', () => {
  it('P577から公開年を取り出す', () => {
    const claims = {
      P577: [{mainsnak: {datavalue: {value: {time: '+1959-11-01T00:00:00Z'}}}}],
    };

    expect(publicationYearFromClaims(claims)).toBe(1959);
  });

  it('公開日が複数ある場合は最も早い年を採る', () => {
    const claims = {
      P577: [
        {mainsnak: {datavalue: {value: {time: '+1960-03-01T00:00:00Z'}}}},
        {mainsnak: {datavalue: {value: {time: '+1959-11-01T00:00:00Z'}}}},
      ],
    };

    expect(publicationYearFromClaims(claims)).toBe(1959);
  });

  it('P577が無ければundefinedを返す', () => {
    expect(publicationYearFromClaims({P345: []})).toBeUndefined();
  });
});

describe('isPlausibleEditionYear', () => {
  it('日本映画は年度と同じ年を認める', () => {
    expect(isPlausibleEditionYear(1959, 1959, 'japanese')).toBe(true);
  });

  it('日本映画は映画祭プレミアの前年を認める', () => {
    expect(isPlausibleEditionYear(1958, 1959, 'japanese')).toBe(true);
  });

  it('日本映画は2年以上前を認めない', () => {
    expect(isPlausibleEditionYear(1957, 1959, 'japanese')).toBe(false);
  });

  it('日本映画は年始公開で年度の翌年になるのを認める', () => {
    expect(isPlausibleEditionYear(1960, 1959, 'japanese')).toBe(true);
  });

  it('日本映画は2年以上後を認めない', () => {
    expect(isPlausibleEditionYear(1961, 1959, 'japanese')).toBe(false);
  });

  it('外国映画は本国公開が数年前でも認める', () => {
    expect(isPlausibleEditionYear(1950, 1959, 'foreign')).toBe(true);
  });

  it('外国映画も2年以上後の公開は認めない', () => {
    expect(isPlausibleEditionYear(1961, 1959, 'foreign')).toBe(false);
  });

  it('公開年が分からない場合は判断しない', () => {
    expect(isPlausibleEditionYear(undefined, 1959, 'japanese')).toBe(true);
  });
});

const editions: KinemaJunpoEdition[] = [
  {
    year: 1959,
    japanese: [
      {rank: 1, page: '野火', title: '野火'},
      {rank: 2, page: 'キクとイサム', title: 'キクとイサム'},
    ],
    foreign: [{rank: 1, page: '大いなる西部', title: '大いなる西部'}],
  },
  {
    year: 2016,
    japanese: [{rank: 1, page: '怒り (小説)', title: '怒り'}],
    foreign: [],
  },
];

function createResolved(): Map<string, ResolvedFilm> {
  return new Map<string, ResolvedFilm>([
    ['野火', {imdbId: 'tt3465156', publicationYear: 2014}],
    ['キクとイサム', {imdbId: 'tt0052858', publicationYear: 1959}],
    ['大いなる西部', {imdbId: 'tt0051411', publicationYear: 1958}],
    ['怒り (小説)', {imdbId: 'tt4384088', publicationYear: 2014}],
  ]);
}

describe('年の合わない解決結果の扱い', () => {
  it('年の離れた解決結果だけを候補に挙げる', () => {
    const candidates = collectImplausibleResolutions(
      editions,
      createResolved(),
    );

    expect(candidates.map(candidate => candidate.key)).toEqual([
      '野火',
      '怒り (小説)',
    ]);
  });

  it('TMDbの公開年でも合わないものを捨てる', async () => {
    const resolved = createResolved();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const dropped = await dropMisattributedResolutions({
      editions,
      resolved,
      throttleMs: 0,
      async fetchReleaseYear(imdbId) {
        return imdbId === 'tt3465156' ? 2014 : 2016;
      },
    });

    expect(dropped).toBe(1);
    expect(resolved.has('野火')).toBe(false);
  });

  it('Wikidataの公開年が原作の出版年でもTMDbが合えば残す', async () => {
    const resolved = createResolved();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await dropMisattributedResolutions({
      editions,
      resolved,
      throttleMs: 0,
      async fetchReleaseYear() {
        return 2016;
      },
    });

    expect(resolved.has('怒り (小説)')).toBe(true);
  });

  it('公開年を確認できない場合は残す', async () => {
    const resolved = createResolved();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const dropped = await dropMisattributedResolutions({
      editions,
      resolved,
      throttleMs: 0,
      async fetchReleaseYear(): Promise<number | undefined> {
        return;
      },
    });

    expect(dropped).toBe(0);
    expect(resolved.has('野火')).toBe(true);
  });

  it('年が合う解決結果は候補にならない', () => {
    const candidates = collectImplausibleResolutions(
      editions,
      createResolved(),
    );

    expect(candidates.map(candidate => candidate.key)).not.toContain(
      'キクとイサム',
    );
    expect(candidates.map(candidate => candidate.key)).not.toContain(
      '大いなる西部',
    );
  });
});
