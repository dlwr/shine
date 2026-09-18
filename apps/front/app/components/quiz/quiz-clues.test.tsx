import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {QuizClues} from './quiz-clues';
import type {QuizGameState} from '@/lib/quiz-state';

const game = {
  guesses: [{correct: false}],
  hints: [],
} as unknown as QuizGameState;

describe('QuizClues', () => {
  it('手数の目盛りに役割と名前を与える', () => {
    render(<QuizClues game={game} maxAttempts={5} />);

    expect(screen.getByRole('group', {name: '残りの手数'})).toBeInTheDocument();
  });
});
