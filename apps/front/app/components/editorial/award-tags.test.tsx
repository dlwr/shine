import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {AwardTags} from './award-tags';

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
