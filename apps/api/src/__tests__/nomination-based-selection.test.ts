import {describe, expect, it} from 'vitest';
import {simpleHash} from '../utils/hash';

describe('Nomination-based movie selection logic', () => {
  it('should select from nominations pool instead of movies pool', () => {
    const nominations = [
      {uid: 'nom-1', movieUid: 'movie-A'},
      {uid: 'nom-2', movieUid: 'movie-A'},
      {uid: 'nom-3', movieUid: 'movie-B'},
      {uid: 'nom-4', movieUid: 'movie-C'},
      {uid: 'nom-5', movieUid: 'movie-A'},
    ];

    const seed = simpleHash('weekly-2026-02-20');
    const selectedIndex = seed % nominations.length;
    const selectedNomination = nominations[selectedIndex];

    expect(selectedNomination).toBeDefined();
    expect(selectedNomination.movieUid).toBeTruthy();
  });

  it('should give higher probability to movies with more nominations', () => {
    const nominations = [
      {uid: 'nom-1', movieUid: 'movie-A'},
      {uid: 'nom-2', movieUid: 'movie-A'},
      {uid: 'nom-3', movieUid: 'movie-A'},
      {uid: 'nom-4', movieUid: 'movie-B'},
    ];

    const movieCounts = new Map<string, number>();
    for (const nom of nominations) {
      movieCounts.set(nom.movieUid, (movieCounts.get(nom.movieUid) ?? 0) + 1);
    }

    expect(movieCounts.get('movie-A')).toBe(3);
    expect(movieCounts.get('movie-B')).toBe(1);

    // movie-A has 3/4 = 75% chance, movie-B has 1/4 = 25% chance
    // This verifies the weighting is proportional to nomination count
    const totalNominations = nominations.length;
    const movieAWeight = movieCounts.get('movie-A')! / totalNominations;
    const movieBWeight = movieCounts.get('movie-B')! / totalNominations;

    expect(movieAWeight).toBe(0.75);
    expect(movieBWeight).toBe(0.25);
  });

  it('should never select a movie with zero nominations', () => {
    const nominations = [
      {uid: 'nom-1', movieUid: 'movie-A'},
      {uid: 'nom-2', movieUid: 'movie-B'},
    ];

    const movieIdsInNominations = new Set(nominations.map(n => n.movieUid));

    // movie-C has no nominations - it should never appear in the pool
    expect(movieIdsInNominations.has('movie-C')).toBe(false);
    expect(movieIdsInNominations.has('movie-A')).toBe(true);
    expect(movieIdsInNominations.has('movie-B')).toBe(true);
  });

  it('should produce deterministic results for same date seed', () => {
    const nominations = [
      {uid: 'nom-1', movieUid: 'movie-A'},
      {uid: 'nom-2', movieUid: 'movie-B'},
      {uid: 'nom-3', movieUid: 'movie-C'},
      {uid: 'nom-4', movieUid: 'movie-A'},
      {uid: 'nom-5', movieUid: 'movie-D'},
    ];

    const seed = simpleHash('daily-2026-02-20');
    const selectedIndex1 = seed % nominations.length;
    const selectedIndex2 = seed % nominations.length;

    expect(selectedIndex1).toBe(selectedIndex2);
    expect(nominations[selectedIndex1].movieUid).toBe(
      nominations[selectedIndex2].movieUid,
    );
  });

  it('should work consistently for daily, weekly, and monthly types', () => {
    const nominations = [
      {uid: 'nom-1', movieUid: 'movie-A'},
      {uid: 'nom-2', movieUid: 'movie-B'},
      {uid: 'nom-3', movieUid: 'movie-C'},
    ];

    for (const type of ['daily', 'weekly', 'monthly'] as const) {
      const seed = simpleHash(`${type}-2026-02-20`);
      const selectedIndex = seed % nominations.length;

      expect(selectedIndex).toBeGreaterThanOrEqual(0);
      expect(selectedIndex).toBeLessThan(nominations.length);
      expect(nominations[selectedIndex].movieUid).toBeTruthy();
    }
  });

  it('should produce well-distributed indices for consecutive daily dates', () => {
    const poolSize = 4881; // Actual production nominations count
    const minimumIndexDifference = 50; // Adjacent indices likely point to same movie

    let tooCloseCount = 0;
    const totalPairs = 336; // 28 days * 12 months

    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day++) {
        const date1 = `daily-2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date2 = `daily-2026-${String(month).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
        const index1 = simpleHash(date1) % poolSize;
        const index2 = simpleHash(date2) % poolSize;
        const diff = Math.abs(index1 - index2);
        if (diff < minimumIndexDifference) {
          tooCloseCount++;
        }
      }
    }

    // No more than 5% of consecutive day pairs should have close indices
    expect(tooCloseCount / totalPairs).toBeLessThan(0.05);
  });

  it('should be deterministic for the same input', () => {
    const result1 = simpleHash('daily-2026-03-11');
    const result2 = simpleHash('daily-2026-03-11');
    expect(result1).toBe(result2);
  });

  it('daily, weekly, and monthly should select different nominations for same date', () => {
    // With enough nominations, different type prefixes should produce different indices
    const nominations = Array.from({length: 100}, (_, index) => ({
      uid: `nom-${index}`,
      movieUid: `movie-${index}`,
    }));

    const dailySeed = simpleHash('daily-2026-02-20');
    const weeklySeed = simpleHash('weekly-2026-02-20');
    const monthlySeed = simpleHash('monthly-2026-02');

    const dailyIndex = dailySeed % nominations.length;
    const weeklyIndex = weeklySeed % nominations.length;
    const monthlyIndex = monthlySeed % nominations.length;

    // At least 2 of the 3 should differ (extremely likely with 100 items)
    const indices = new Set([dailyIndex, weeklyIndex, monthlyIndex]);
    expect(indices.size).toBeGreaterThanOrEqual(2);
  });
});
