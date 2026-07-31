/* eslint-disable unicorn/no-null */
import {fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {NominationTable} from './nomination-table';
import type {CeremonyResponse} from './types';

const nominations: CeremonyResponse['nominations'] = [
  {
    uid: 'nomination-1',
    movie: {uid: 'movie-1', title: '七人の侍', year: 1954},
    category: {uid: 'category-1', name: '最優秀作品賞'},
    isWinner: true,
    specialMention: null,
  },
  {
    uid: 'nomination-2',
    movie: {uid: 'movie-2', title: '羅生門', year: 1950},
    category: {uid: 'category-1', name: '最優秀作品賞'},
    isWinner: false,
    specialMention: '特別賞',
  },
];

describe('NominationTable', () => {
  it('ノミネートの映画タイトルを表示する', () => {
    render(<NominationTable nominations={nominations} onRemove={vi.fn()} />);

    expect(screen.getByText('七人の侍')).toBeInTheDocument();
    expect(screen.getByText('羅生門')).toBeInTheDocument();
  });

  it('受賞状態を表示する', () => {
    render(<NominationTable nominations={nominations} onRemove={vi.fn()} />);

    const winnerRow = screen.getByText('七人の侍').closest('tr');
    expect(winnerRow).not.toBeNull();
    expect(
      within(winnerRow as HTMLElement).getByText('受賞'),
    ).toBeInTheDocument();
    expect(screen.getByText('ノミネート')).toBeInTheDocument();
  });

  it('削除ボタンでonRemoveにノミネートのuidを渡す', () => {
    const onRemove = vi.fn();
    render(<NominationTable nominations={nominations} onRemove={onRemove} />);

    const [firstDeleteButton] = screen.getAllByRole('button', {name: '削除'});
    fireEvent.click(firstDeleteButton);

    expect(onRemove).toHaveBeenCalledWith('nomination-1');
  });

  it('ノミネートが0件の場合は空メッセージを表示する', () => {
    render(<NominationTable nominations={[]} onRemove={vi.fn()} />);

    expect(
      screen.getByText('登録されている映画はありません。'),
    ).toBeInTheDocument();
  });
});
