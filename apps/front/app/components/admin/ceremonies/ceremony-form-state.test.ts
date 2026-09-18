import {describe, expect, it} from 'vitest';
import {
  emptyFormState,
  toCeremonyPayload,
  toFormState,
  validateCeremonyForm,
} from './ceremony-form-state';
import type {CeremonyResponse} from './types';

const ceremony: CeremonyResponse['ceremony'] = {
  uid: 'ceremony-1',
  organizationUid: 'org-1',
  organizationName: 'アカデミー賞',
  organizationCountry: 'United States',
  year: 2024,
  ceremonyNumber: 96,
  startDate: 1_710_000_000,
  endDate: null,
  location: 'ロサンゼルス',
  description: null,
  imdbEventUrl: null,
  createdAt: 0,
  updatedAt: 0,
};

describe('toFormState', () => {
  it('開催年を文字列にする', () => {
    expect(toFormState(ceremony).year).toBe('2024');
  });

  it('回次を文字列にする', () => {
    expect(toFormState(ceremony).ceremonyNumber).toBe('96');
  });

  it('回次がなければ空文字にする', () => {
    expect(
      toFormState({...ceremony, ceremonyNumber: null}).ceremonyNumber,
    ).toBe('');
  });

  it('開始日を日付入力の形式にする', () => {
    expect(toFormState(ceremony).startDate).toBe('2024-03-09');
  });

  it('開催日がなければ空文字にする', () => {
    expect(toFormState(ceremony).endDate).toBe('');
  });

  it('開催場所がなければ空文字にする', () => {
    expect(toFormState({...ceremony, location: null}).location).toBe('');
  });
});

describe('toCeremonyPayload', () => {
  it('回次を数値にする', () => {
    expect(
      toCeremonyPayload({...emptyFormState, ceremonyNumber: '96'})
        .ceremonyNumber,
    ).toBe(96);
  });

  it('回次が空なら送らない', () => {
    expect(toCeremonyPayload(emptyFormState).ceremonyNumber).toBeUndefined();
  });

  it('開催年は文字列のまま送る', () => {
    expect(toCeremonyPayload({...emptyFormState, year: '2024'}).year).toBe(
      '2024',
    );
  });

  it('空の開催場所は送らない', () => {
    expect(toCeremonyPayload(emptyFormState).location).toBeUndefined();
  });

  it('空白だけのIMDbイベントURLは送らない', () => {
    expect(
      toCeremonyPayload({...emptyFormState, imdbEventUrl: ' '.repeat(3)})
        .imdbEventUrl,
    ).toBeUndefined();
  });

  it('IMDbイベントURLはそのまま送る', () => {
    expect(
      toCeremonyPayload({
        ...emptyFormState,
        imdbEventUrl: 'https://www.imdb.com/event/ev0000003/2024/1',
      }).imdbEventUrl,
    ).toBe('https://www.imdb.com/event/ev0000003/2024/1');
  });
});

describe('validateCeremonyForm', () => {
  it('主催団体がなければエラーを返す', () => {
    expect(validateCeremonyForm(emptyFormState)).toBe(
      '主催団体を選択してください。',
    );
  });

  it('開催年がなければエラーを返す', () => {
    expect(
      validateCeremonyForm({...emptyFormState, organizationUid: 'org-1'}),
    ).toBe('開催年を入力してください。');
  });

  it('必須が揃っていればエラーを返さない', () => {
    expect(
      validateCeremonyForm({
        ...emptyFormState,
        organizationUid: 'org-1',
        year: '2024',
      }),
    ).toBeUndefined();
  });
});
