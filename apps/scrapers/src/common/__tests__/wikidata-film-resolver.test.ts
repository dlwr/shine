import {describe, expect, it, vi} from 'vitest';
import {
  collectDuplicateResolutions,
  dropDuplicateResolutions,
  collectImplausibleResolutions,
  dropMisattributedResolutions,
  isPlausiblePublicationYear,
  publicationYearFromClaims,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from '../wikidata-film-resolver';

const SAME_YEAR: YearWindow = {min: -1, max: 1};
const EARLIER_ONLY: YearWindow = {min: -Infinity, max: 1};

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

describe('isPlausiblePublicationYear', () => {
  it('対象年と同じ年を認める', () => {
    expect(isPlausiblePublicationYear(1959, 1959, SAME_YEAR)).toBe(true);
  });

  it('窓の下限まで認める', () => {
    expect(isPlausiblePublicationYear(1958, 1959, SAME_YEAR)).toBe(true);
  });

  it('窓の下限を超えたら認めない', () => {
    expect(isPlausiblePublicationYear(1957, 1959, SAME_YEAR)).toBe(false);
  });

  it('窓の上限まで認める', () => {
    expect(isPlausiblePublicationYear(1960, 1959, SAME_YEAR)).toBe(true);
  });

  it('窓の上限を超えたら認めない', () => {
    expect(isPlausiblePublicationYear(1961, 1959, SAME_YEAR)).toBe(false);
  });

  it('下限のない窓では何年前でも認める', () => {
    expect(isPlausiblePublicationYear(1930, 1959, EARLIER_ONLY)).toBe(true);
  });

  it('公開年が分からない場合は判断しない', () => {
    expect(isPlausiblePublicationYear(undefined, 1959, SAME_YEAR)).toBe(true);
  });
});

const references: FilmReference[] = [
  {key: '野火', title: '野火', targetYear: 1959, yearWindow: SAME_YEAR},
  {
    key: 'キクとイサム',
    title: 'キクとイサム',
    targetYear: 1959,
    yearWindow: SAME_YEAR,
  },
  {
    key: '大いなる西部',
    title: '大いなる西部',
    targetYear: 1959,
    yearWindow: EARLIER_ONLY,
  },
  {key: '怒り (小説)', title: '怒り', targetYear: 2016, yearWindow: SAME_YEAR},
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
      references,
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
      references,
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
      references,
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
      references,
      resolved,
      throttleMs: 0,
      async fetchReleaseYear(): Promise<number | undefined> {
        return;
      },
    });

    expect(dropped).toBe(0);
    expect(resolved.has('野火')).toBe(true);
  });
});

describe('collectDuplicateResolutions', () => {
  it('複数の年が同じ映画を指しているものを報告する', () => {
    const serialReferences: FilmReference[] = [
      {
        key: '浪人街',
        title: '浪人街 第一話',
        targetYear: 1928,
        yearWindow: SAME_YEAR,
      },
      {
        key: '浪人街',
        title: '浪人街 第三話',
        targetYear: 1929,
        yearWindow: SAME_YEAR,
      },
    ];
    const resolved = new Map<string, ResolvedFilm>([
      ['浪人街', {imdbId: 'tt0020342'}],
    ]);

    expect(collectDuplicateResolutions(serialReferences, resolved)).toEqual([
      {
        imdbId: 'tt0020342',
        entries: [
          {targetYear: 1928, title: '浪人街 第一話'},
          {targetYear: 1929, title: '浪人街 第三話'},
        ],
      },
    ]);
  });

  it('1つの年にしか出ない映画は報告しない', () => {
    expect(collectDuplicateResolutions(references, createResolved())).toEqual(
      [],
    );
  });
});

describe('dropDuplicateResolutions', () => {
  const serialReferences: FilmReference[] = [
    {key: '学校', title: '学校', targetYear: 1993, yearWindow: SAME_YEAR},
    {key: '学校', title: '学校II', targetYear: 1996, yearWindow: SAME_YEAR},
    {
      key: 'キクとイサム',
      title: 'キクとイサム',
      targetYear: 1959,
      yearWindow: SAME_YEAR,
    },
  ];

  it('複数の年が指している解決結果を捨てる', () => {
    const resolved = new Map<string, ResolvedFilm>([
      ['学校', {imdbId: 'tt0338679'}],
      ['キクとイサム', {imdbId: 'tt0052858'}],
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const dropped = dropDuplicateResolutions(serialReferences, resolved);

    expect(dropped).toBe(1);
    expect(resolved.has('学校')).toBe(false);
  });

  it('1つの年しか指していない解決結果は残す', () => {
    const resolved = new Map<string, ResolvedFilm>([
      ['学校', {imdbId: 'tt0338679'}],
      ['キクとイサム', {imdbId: 'tt0052858'}],
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    dropDuplicateResolutions(serialReferences, resolved);

    expect(resolved.has('キクとイサム')).toBe(true);
  });
});
