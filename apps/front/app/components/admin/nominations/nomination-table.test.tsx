import {fireEvent, render, screen, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import {NominationTable} from './nomination-table';
import type {Nomination} from './types';

const nominations: Nomination[] = [
  {
    uid: 'nomination-1',
    isWinner: true,
    specialMention: '特別賞',
    category: {uid: 'category-1', name: '最優秀作品賞'},
    ceremony: {uid: 'ceremony-1', number: 47, year: 2024},
    organization: {uid: 'org-1', name: '日本アカデミー賞', shortName: 'JAA'},
  },
  {
    uid: 'nomination-2',
    isWinner: false,
    specialMention: null,
    category: {uid: 'category-2', name: '最優秀監督賞'},
    ceremony: {uid: 'ceremony-2', number: 46, year: 2023},
    organization: {uid: 'org-1', name: '日本アカデミー賞', shortName: 'JAA'},
  },
];

const renderTable = (
  overrides: Partial<Parameters<typeof NominationTable>[0]> = {},
) => {
  const properties: Parameters<typeof NominationTable>[0] = {
    nominations,
    deletingNominationId: undefined,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  render(
    <MemoryRouter>
      <NominationTable {...properties} />
    </MemoryRouter>,
  );
  return properties;
};

describe('NominationTable', () => {
  it('ノミネートが無ければその旨を出す', () => {
    renderTable({nominations: []});

    expect(screen.getByText('ノミネートがありません')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('部門名を行ごとに出す', () => {
    renderTable();

    expect(screen.getByText('最優秀作品賞')).toBeInTheDocument();
    expect(screen.getByText('最優秀監督賞')).toBeInTheDocument();
  });

  it('受賞とノミネートを区別して出す', () => {
    renderTable();

    const winnerRow = screen.getByText('最優秀作品賞').closest('tr');
    const nomineeRow = screen.getByText('最優秀監督賞').closest('tr');
    expect(within(winnerRow!).getByText('受賞')).toBeInTheDocument();
    expect(within(nomineeRow!).getByText('ノミネート')).toBeInTheDocument();
  });

  it('特記事項が無ければ - を出す', () => {
    renderTable();

    const nomineeRow = screen.getByText('最優秀監督賞').closest('tr');
    expect(within(nomineeRow!).getByText('-')).toBeInTheDocument();
  });

  it('授賞式の管理ページへリンクする', () => {
    renderTable();

    const winnerRow = screen.getByText('最優秀作品賞').closest('tr');
    expect(within(winnerRow!).getByRole('link')).toHaveAttribute(
      'href',
      '/admin/ceremonies/ceremony-1',
    );
  });

  it('編集を押すとそのノミネートを onEdit に渡す', () => {
    const {onEdit} = renderTable();

    const winnerRow = screen.getByText('最優秀作品賞').closest('tr');
    fireEvent.click(within(winnerRow!).getByRole('button', {name: '編集'}));

    expect(onEdit).toHaveBeenCalledWith(nominations[0]);
  });

  it('削除を押すとそのノミネートを onDelete に渡す', () => {
    const {onDelete} = renderTable();

    const nomineeRow = screen.getByText('最優秀監督賞').closest('tr');
    fireEvent.click(within(nomineeRow!).getByRole('button', {name: '削除'}));

    expect(onDelete).toHaveBeenCalledWith(nominations[1]);
  });

  it('削除中の行だけボタンを「削除中...」にして押せなくする', () => {
    renderTable({deletingNominationId: 'nomination-2'});

    expect(screen.getByRole('button', {name: '削除中...'})).toBeDisabled();
    expect(screen.getByRole('button', {name: '削除'})).toBeEnabled();
  });
});
