import {describe, expect, it} from 'vitest';
import {
  applyGuess,
  createGame,
  filterCandidates,
  recordResult,
  shareText,
  streakOf,
  type QuizGameState,
} from './quiz-state';

const MAX_ATTEMPTS = 6;
const ANSWER = {uid: 'movie-a', title: '赤ひげ', year: 1965};

function play(
  outcomes: Array<{title?: string; correct: boolean}>,
): QuizGameState {
  let state = createGame('2026-08-16');
  for (const [index, outcome] of outcomes.entries()) {
    const settled = outcome.correct || index + 1 >= MAX_ATTEMPTS;
    state = applyGuess(
      state,
      outcome,
      settled ? {answer: ANSWER} : {hint: {label: '製作年', value: '1965年'}},
      MAX_ATTEMPTS,
    );
  }

  return state;
}

describe('applyGuess', () => {
  it('keeps playing after a wrong guess', () => {
    const state = play([{title: '東京物語', correct: false}]);

    expect(state.status).toBe('playing');
  });

  it('collects the hint from a wrong guess', () => {
    const state = play([{title: '東京物語', correct: false}]);

    expect(state.hints).toHaveLength(1);
  });

  it('wins on a correct guess', () => {
    const state = play([{title: '赤ひげ', correct: true}]);

    expect(state.status).toBe('won');
  });

  it('keeps the answer once won', () => {
    const state = play([{title: '赤ひげ', correct: true}]);

    expect(state.answer).toEqual(ANSWER);
  });

  it('loses after the last attempt', () => {
    const state = play(
      Array.from({length: MAX_ATTEMPTS}, () => ({
        title: '東京物語',
        correct: false,
      })),
    );

    expect(state.status).toBe('lost');
  });
});

describe('filterCandidates', () => {
  const candidates = [
    {uid: 'a', title: '赤ひげ'},
    {uid: 'b', title: '東京物語'},
    {uid: 'c', title: '007／ゴールドフィンガー'},
  ];

  it('matches by substring', () => {
    expect(filterCandidates(candidates, '東京', 8)).toHaveLength(1);
  });

  it('ignores separators in the title', () => {
    expect(filterCandidates(candidates, '007ゴールド', 8)).toHaveLength(1);
  });

  it('returns nothing for an empty query', () => {
    expect(filterCandidates(candidates, '  ', 8)).toEqual([]);
  });

  it('caps the number of matches', () => {
    expect(filterCandidates(candidates, '', 8)).toEqual([]);
  });
});

describe('shareText', () => {
  it('marks the winning guess', () => {
    const state = play([
      {title: '東京物語', correct: false},
      {title: '赤ひげ', correct: true},
    ]);

    expect(shareText(state, MAX_ATTEMPTS)).toContain('🟥🟩⬜⬜⬜⬜');
  });

  it('shows the score', () => {
    const state = play([
      {title: '東京物語', correct: false},
      {title: '赤ひげ', correct: true},
    ]);

    expect(shareText(state, MAX_ATTEMPTS)).toContain('2/6');
  });

  it('marks a pass differently from a wrong guess', () => {
    const state = play([
      {correct: false},
      {title: '東京物語', correct: false},
      {title: '赤ひげ', correct: true},
    ]);

    expect(shareText(state, MAX_ATTEMPTS)).toContain('⬛🟥🟩');
  });

  it('scores a loss as X', () => {
    const state = play(
      Array.from({length: MAX_ATTEMPTS}, () => ({
        title: '東京物語',
        correct: false,
      })),
    );

    expect(shareText(state, MAX_ATTEMPTS)).toContain('X');
  });

  it('never leaks the answer', () => {
    const state = play([{title: '赤ひげ', correct: true}]);

    expect(shareText(state, MAX_ATTEMPTS)).not.toContain('赤ひげ');
  });
});

describe('streakOf', () => {
  it('counts consecutive wins', () => {
    const history = {
      '2026-08-14': {attempts: 2, won: true},
      '2026-08-15': {attempts: 3, won: true},
      '2026-08-16': {attempts: 1, won: true},
    };

    expect(streakOf(history, '2026-08-16')).toBe(3);
  });

  it('stops at a loss', () => {
    const history = {
      '2026-08-14': {attempts: 6, won: false},
      '2026-08-15': {attempts: 3, won: true},
      '2026-08-16': {attempts: 1, won: true},
    };

    expect(streakOf(history, '2026-08-16')).toBe(2);
  });

  it('stops at a missed day', () => {
    const history = {
      '2026-08-14': {attempts: 2, won: true},
      '2026-08-16': {attempts: 1, won: true},
    };

    expect(streakOf(history, '2026-08-16')).toBe(1);
  });
});

describe('recordResult', () => {
  it('stores a finished game', () => {
    const state = play([{title: '赤ひげ', correct: true}]);

    expect(recordResult({}, state)['2026-08-16']).toEqual({
      attempts: 1,
      won: true,
    });
  });

  it('ignores a game in progress', () => {
    const state = play([{title: '東京物語', correct: false}]);

    expect(recordResult({}, state)).toEqual({});
  });
});
