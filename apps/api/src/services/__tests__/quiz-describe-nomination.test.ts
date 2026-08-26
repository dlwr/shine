import {describe, expect, it} from 'vitest';
import {describeNomination} from '../quiz-service';

describe('describeNomination', () => {
  it('年度制の賞は組織名と年で説明する', () => {
    expect(
      describeNomination({
        organizationName: 'Cannes Film Festival',
        categoryName: "Palme d'Or",
        ceremonyYear: 1980,
        isWinner: true,
        specialMention: undefined,
      }).achievement,
    ).toBe('カンヌ国際映画祭 1980年 受賞');
  });

  it('リスト型の賞は選出と説明する', () => {
    expect(
      describeNomination({
        organizationName: 'Variety',
        categoryName: 'Top 100 Greatest Movies of All Time',
        ceremonyYear: 2022,
        isWinner: true,
        specialMention: undefined,
      }).achievement,
    ).toBe('Varietyに選出');
  });

  it('賞ページの無い部門は部門名も出す', () => {
    expect(
      describeNomination({
        organizationName: 'Japan Academy Awards',
        categoryName: '監督賞',
        ceremonyYear: 2026,
        isWinner: true,
        specialMention: undefined,
      }).achievement,
    ).toBe('日本アカデミー賞 監督賞 2026年 受賞');
  });

  it('部門名が英語の個人賞は部門名を日本語で出す', () => {
    expect(
      describeNomination({
        organizationName: 'Academy Awards',
        categoryName: 'Academy Award for Best Actress',
        ceremonyYear: 2023,
        isWinner: true,
        specialMention: undefined,
      }).achievement,
    ).toBe('アカデミー賞 主演女優賞 2023年 受賞');
  });

  it('作品賞は部門名を出さない', () => {
    expect(
      describeNomination({
        organizationName: 'Japan Academy Awards',
        categoryName: '優秀作品賞',
        ceremonyYear: 2026,
        isWinner: false,
        specialMention: undefined,
      }).achievement,
    ).toBe('日本アカデミー賞 2026年 ノミネート');
  });
});
