import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {AwardTags, PersonalAwardTags} from './award-tags';

const LEGEND = [
  {
    slug: 'palme-dor',
    shortLabel: 'カンヌ',
    name: 'パルム・ドール',
    organization: 'カンヌ国際映画祭',
  },
  {
    slug: 'academy-best-picture',
    shortLabel: 'アカデミー',
    name: '作品賞',
    organization: 'アカデミー賞',
  },
];

describe('AwardTags', () => {
  it('賞の短縮ラベルを描画する', () => {
    render(
      <AwardTags
        tags={[{slug: 'palme-dor', isWinner: true}]}
        legend={LEGEND}
      />,
    );
    expect(screen.getByText('カンヌ')).toBeInTheDocument();
  });

  it('受賞なら受賞と分かる説明を付ける', () => {
    render(
      <AwardTags
        tags={[{slug: 'palme-dor', isWinner: true}]}
        legend={LEGEND}
      />,
    );
    expect(screen.getByText('カンヌ')).toHaveAttribute(
      'title',
      'カンヌ国際映画祭 パルム・ドール 受賞',
    );
  });

  it('ノミネート止まりなら選出と分かる説明を付ける', () => {
    render(
      <AwardTags
        tags={[{slug: 'academy-best-picture', isWinner: false}]}
        legend={LEGEND}
      />,
    );
    expect(screen.getByText('アカデミー')).toHaveAttribute(
      'title',
      'アカデミー賞 作品賞 選出',
    );
  });

  it('凡例に無い賞は描画しない', () => {
    render(
      <AwardTags tags={[{slug: 'unknown', isWinner: true}]} legend={LEGEND} />,
    );
    expect(screen.queryByText('unknown')).not.toBeInTheDocument();
  });

  it('タグが無ければ何も描画しない', () => {
    const {container} = render(<AwardTags tags={[]} legend={LEGEND} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('PersonalAwardTags', () => {
  it('部門名を描画する', () => {
    render(
      <PersonalAwardTags
        awards={[
          {
            organization: '日本アカデミー賞',
            category: '監督賞',
            year: 2026,
            isWinner: true,
          },
        ]}
      />,
    );
    expect(screen.getByText('監督賞')).toBeInTheDocument();
  });

  it('受賞なら組織名と受賞を説明に付ける', () => {
    render(
      <PersonalAwardTags
        awards={[
          {
            organization: '日本アカデミー賞',
            category: '監督賞',
            year: 2026,
            isWinner: true,
          },
        ]}
      />,
    );
    expect(screen.getByText('監督賞')).toHaveAttribute(
      'title',
      '日本アカデミー賞 監督賞 2026年 受賞',
    );
  });

  it('ノミネート止まりならノミネートと説明する', () => {
    render(
      <PersonalAwardTags
        awards={[
          {
            organization: '日本アカデミー賞',
            category: '主演男優賞',
            year: 2026,
            isWinner: false,
          },
        ]}
      />,
    );
    expect(screen.getByText('主演男優賞')).toHaveAttribute(
      'title',
      '日本アカデミー賞 主演男優賞 2026年 ノミネート',
    );
  });

  it('賞が無ければ何も描画しない', () => {
    const {container} = render(<PersonalAwardTags awards={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
