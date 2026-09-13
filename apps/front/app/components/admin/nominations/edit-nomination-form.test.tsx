import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {EditNominationForm} from './edit-nomination-form';

const renderForm = (
  overrides: Partial<Parameters<typeof EditNominationForm>[0]> = {},
) => {
  const properties: Parameters<typeof EditNominationForm>[0] = {
    values: {isWinner: true, specialMention: '特別賞'},
    isUpdating: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(event => event.preventDefault()),
    onCancel: vi.fn(),
    ...overrides,
  };

  render(<EditNominationForm {...properties} />);
  return properties;
};

describe('EditNominationForm', () => {
  it('編集中の値を表示する', () => {
    renderForm();

    expect(screen.getByLabelText('受賞（Winner）')).toBeChecked();
    expect(screen.getByLabelText('特記事項')).toHaveValue('特別賞');
  });

  it('受賞チェックを変えると onChange に isWinner を渡す', () => {
    const {onChange} = renderForm();

    fireEvent.click(screen.getByLabelText('受賞（Winner）'));

    expect(onChange).toHaveBeenCalledWith({isWinner: false});
  });

  it('特記事項を入力すると onChange に specialMention を渡す', () => {
    const {onChange} = renderForm();

    fireEvent.change(screen.getByLabelText('特記事項'), {
      target: {value: '審査員賞'},
    });

    expect(onChange).toHaveBeenCalledWith({specialMention: '審査員賞'});
  });

  it('保存すると onSubmit を呼ぶ', () => {
    const {onSubmit} = renderForm();

    fireEvent.submit(screen.getByRole('button', {name: '保存'}));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('キャンセルすると onCancel を呼ぶ', () => {
    const {onCancel} = renderForm();

    fireEvent.click(screen.getByRole('button', {name: 'キャンセル'}));

    expect(onCancel).toHaveBeenCalled();
  });

  it('更新中はボタンを押せなくして「更新中...」にする', () => {
    renderForm({isUpdating: true});

    expect(screen.getByRole('button', {name: '更新中...'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'キャンセル'})).toBeDisabled();
  });
});
