import {describe, expect, it} from 'vitest';
import {timelineDecades, type TimelineCredit} from './person-timeline';

const credit = (
  movieUid: string,
  year: number | undefined,
  overrides: Partial<TimelineCredit> = {},
): TimelineCredit => ({
  movieUid,
  title: movieUid,
  year,
  awards: [],
  personAwards: [],
  ...overrides,
});

describe('timelineDecades', () => {
  it('参加作を10年ごとに古い順で束ねる', () => {
    const decades = timelineDecades(
      [credit('c', 1985), credit('a', 1972), credit('b', 1979)],
      new Set(),
    );

    expect(
      decades.map(decade => [
        decade.decade,
        decade.entries.map(entry => entry.movieUid),
      ]),
    ).toEqual([
      [1970, ['a', 'b']],
      [1980, ['c']],
    ]);
  });

  it('公開年の無い参加作は並べない', () => {
    expect(timelineDecades([credit('a', undefined)], new Set())).toEqual([]);
  });

  it('個人賞の受賞を受賞とする', () => {
    const [decade] = timelineDecades(
      [
        credit('a', 1985, {
          personAwards: [
            {
              organization: '日本アカデミー賞',
              category: '監督賞',
              year: 1986,
              isWinner: true,
            },
          ],
        }),
      ],
      new Set(),
    );

    expect(decade.entries[0].honor).toBe('won');
  });

  it('年度制の賞のノミネートをノミネートとする', () => {
    const [decade] = timelineDecades(
      [credit('a', 1985, {awards: [{slug: 'oscar', isWinner: false}]})],
      new Set(['oscar']),
    );

    expect(decade.entries[0].honor).toBe('nominated');
  });

  it('リスト型の賞は印にしない', () => {
    const [decade] = timelineDecades(
      [credit('a', 1985, {awards: [{slug: '1001-movies', isWinner: true}]})],
      new Set(['oscar']),
    );

    expect(decade.entries[0].honor).toBeUndefined();
  });
});
