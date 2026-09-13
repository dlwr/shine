import {fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {AddNominationForm} from './add-nomination-form';
import type {AwardsData} from './types';

const awardsData: AwardsData = {
  organizations: [
    {
      uid: 'org-1',
      name: '日本アカデミー賞',
      country: 'Japan',
      shortName: 'JAA',
    },
    {uid: 'org-2', name: 'キネマ旬報', country: 'Japan', shortName: 'キネ旬'},
  ],
  ceremonies: [
    {
      uid: 'ceremony-2022',
      organizationUid: 'org-1',
      year: 2022,
      ceremonyNumber: 45,
      organizationName: '日本アカデミー賞',
    },
    {
      uid: 'ceremony-2024',
      organizationUid: 'org-1',
      year: 2024,
      ceremonyNumber: 47,
      organizationName: '日本アカデミー賞',
    },
    {
      uid: 'ceremony-2023',
      organizationUid: 'org-1',
      year: 2023,
      ceremonyNumber: 46,
      organizationName: '日本アカデミー賞',
    },
    {
      uid: 'ceremony-kinejun',
      organizationUid: 'org-2',
      year: 2024,
      ceremonyNumber: 97,
      organizationName: 'キネマ旬報',
    },
  ],
  categories: [
    {
      uid: 'category-1',
      organizationUid: 'org-1',
      name: '最優秀作品賞',
      organizationName: '日本アカデミー賞',
    },
    {
      uid: 'category-2',
      organizationUid: 'org-2',
      name: '日本映画ベスト・テン',
      organizationName: 'キネマ旬報',
    },
  ],
};

const emptyValues = {
  organizationUid: '',
  ceremonyUid: '',
  categoryUid: '',
  isWinner: false,
  specialMention: '',
};

const renderForm = (
  overrides: Partial<Parameters<typeof AddNominationForm>[0]> = {},
) => {
  const properties: Parameters<typeof AddNominationForm>[0] = {
    awardsData,
    loadingAwards: false,
    values: emptyValues,
    isAdding: false,
    onOrganizationChange: vi.fn(),
    onChange: vi.fn(),
    onSubmit: vi.fn(event => event.preventDefault()),
    onCancel: vi.fn(),
    ...overrides,
  };

  render(<AddNominationForm {...properties} />);
  return properties;
};

describe('AddNominationForm', () => {
  it('授賞団体の選択肢を略称と国つきで並べる', () => {
    renderForm();

    const select = screen.getByLabelText('授賞団体');
    expect(
      within(select)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual([
      '選択してください',
      '日本アカデミー賞 (JAA) - Japan',
      'キネマ旬報 (キネ旬) - Japan',
    ]);
  });

  it('団体が未選択なら授賞式と部門は選べない', () => {
    renderForm();

    expect(screen.getByLabelText('授賞式')).toBeDisabled();
    expect(screen.getByLabelText('部門')).toBeDisabled();
  });

  it('選んだ団体の授賞式を年の新しい順に出す', () => {
    renderForm({values: {...emptyValues, organizationUid: 'org-1'}});

    const select = screen.getByLabelText('授賞式');
    expect(select).toBeEnabled();
    expect(
      within(select)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual([
      '選択してください',
      '2024年 / 第47回',
      '2023年 / 第46回',
      '2022年 / 第45回',
    ]);
  });

  it('選んだ団体の部門だけを出す', () => {
    renderForm({values: {...emptyValues, organizationUid: 'org-2'}});

    const select = screen.getByLabelText('部門');
    expect(
      within(select)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['選択してください', '日本映画ベスト・テン']);
  });

  it('団体を変えると onOrganizationChange に uid を渡す', () => {
    const {onOrganizationChange} = renderForm();

    fireEvent.change(screen.getByLabelText('授賞団体'), {
      target: {value: 'org-1'},
    });

    expect(onOrganizationChange).toHaveBeenCalledWith('org-1');
  });

  it('授賞式を変えると onChange に ceremonyUid を渡す', () => {
    const {onChange} = renderForm({
      values: {...emptyValues, organizationUid: 'org-1'},
    });

    fireEvent.change(screen.getByLabelText('授賞式'), {
      target: {value: 'ceremony-2024'},
    });

    expect(onChange).toHaveBeenCalledWith({ceremonyUid: 'ceremony-2024'});
  });

  it('受賞チェックを変えると onChange に isWinner を渡す', () => {
    const {onChange} = renderForm();

    fireEvent.click(screen.getByLabelText('受賞（Winner）'));

    expect(onChange).toHaveBeenCalledWith({isWinner: true});
  });

  it('特記事項を入力すると onChange に specialMention を渡す', () => {
    const {onChange} = renderForm();

    fireEvent.change(screen.getByLabelText('特記事項'), {
      target: {value: '審査員賞'},
    });

    expect(onChange).toHaveBeenCalledWith({specialMention: '審査員賞'});
  });

  it('送信すると onSubmit を呼ぶ', () => {
    const {onSubmit} = renderForm();

    fireEvent.submit(screen.getByRole('button', {name: 'ノミネートを追加'}));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('キャンセルすると onCancel を呼ぶ', () => {
    const {onCancel} = renderForm();

    fireEvent.click(screen.getByRole('button', {name: 'キャンセル'}));

    expect(onCancel).toHaveBeenCalled();
  });

  it('追加中はボタンを押せなくして「追加中...」にする', () => {
    renderForm({isAdding: true});

    expect(screen.getByRole('button', {name: '追加中...'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'キャンセル'})).toBeDisabled();
  });

  it('賞データの読み込み中は送信できない', () => {
    renderForm({loadingAwards: true, awardsData: undefined});

    expect(
      screen.getByRole('button', {name: 'ノミネートを追加'}),
    ).toBeDisabled();
  });
});
