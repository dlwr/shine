import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  PersonAwardHistory,
  type AwardHistoryCredit,
} from './person-award-history';

const credits: AwardHistoryCredit[] = [
  {
    movieUid: 'movie-perfect-days',
    title: 'PERFECT DAYS',
    year: 2023,
    personAwards: [
      {
        slug: 'cannes-best-actor',
        organization: 'カンヌ国際映画祭',
        category: '男優賞',
        year: 2023,
        isWinner: true,
      },
      {
        slug: 'japan-academy-lead-actor',
        organization: '日本アカデミー賞',
        category: '主演男優賞',
        year: 2024,
        isWinner: true,
      },
    ],
  },
  {
    movieUid: 'movie-third-murder',
    title: '三度目の殺人',
    year: 2017,
    personAwards: [
      {
        slug: 'japan-academy-supporting-actor',
        organization: '日本アカデミー賞',
        category: '助演男優賞',
        year: 2018,
        isWinner: true,
      },
      {
        slug: 'academy-lead-actor',
        organization: 'アカデミー賞',
        category: '主演男優賞',
        year: 2018,
        isWinner: false,
      },
    ],
  },
  {
    movieUid: 'movie-babel',
    title: 'バベル',
    year: 2006,
    personAwards: [],
  },
];

function rowOf(label: RegExp): HTMLElement {
  return screen.getByRole('rowheader', {name: label}).closest('tr')!;
}

describe('PersonAwardHistory', () => {
  it('個人賞の付いた作品を行の見出しに出す', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(
      screen.getByRole('rowheader', {name: /PERFECT DAYS/}),
    ).toBeInTheDocument();
  });

  it('個人賞の無い作品は行に出さない', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(screen.queryByRole('rowheader', {name: /バベル/})).toBeNull();
  });

  it('行の見出しから映画ページへリンクする', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(screen.getByRole('link', {name: 'PERFECT DAYS'})).toHaveAttribute(
      'href',
      '/movies/movie-perfect-days',
    );
  });

  it('長いタイトルは行の見出しで切り詰める', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(screen.getByRole('link', {name: 'PERFECT DAYS'})).toHaveClass(
      'truncate',
    );
  });

  it('行の見出しに作品年を出す', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(screen.getByRole('rowheader', {name: /2023/})).toHaveTextContent(
      'PERFECT DAYS',
    );
  });

  it('団体を短縮ラベルで列の見出しに出す', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(
      screen.getByRole('columnheader', {name: '日本アカデミー'}),
    ).toBeInTheDocument();
  });

  it('列は海外の賞から国内の賞の順に並べる', () => {
    render(<PersonAwardHistory credits={credits} />);

    const headers = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent);

    expect(headers).toEqual(['アカデミー', 'カンヌ', '日本アカデミー']);
  });

  it('短縮ラベルの無い団体は名前のまま末尾に出す', () => {
    render(
      <PersonAwardHistory
        credits={[
          {
            movieUid: 'movie-tokyo',
            title: '東京の映画',
            year: 2000,
            personAwards: [
              {
                organization: '東京国際映画祭',
                category: '主演男優賞',
                year: 2000,
                isWinner: true,
              },
              {
                slug: 'japan-academy-lead-actor',
                organization: '日本アカデミー賞',
                category: '主演男優賞',
                year: 2001,
                isWinner: false,
              },
            ],
          },
        ]}
      />,
    );

    const headers = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent);

    expect(headers).toEqual(['日本アカデミー', '東京国際映画祭']);
  });

  it('セルに部門の短縮ラベルを出す', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(within(rowOf(/三度目の殺人/)).getByText('助演')).toBeInTheDocument();
  });

  it('受賞のセルは受賞と分かる説明を付ける', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(within(rowOf(/三度目の殺人/)).getByText('助演')).toHaveAttribute(
      'title',
      '日本アカデミー賞 助演男優賞 2018年 受賞',
    );
  });

  it('ノミネートのセルはノミネートと分かる説明を付ける', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(within(rowOf(/三度目の殺人/)).getByText('主演')).toHaveAttribute(
      'title',
      'アカデミー賞 主演男優賞 2018年 ノミネート',
    );
  });

  it('受賞のセルはブランド色で塗る', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(within(rowOf(/三度目の殺人/)).getByText('助演')).toHaveClass(
      'bg-brand',
    );
  });

  it('ノミネートのセルは塗らない', () => {
    render(<PersonAwardHistory credits={credits} />);

    expect(within(rowOf(/三度目の殺人/)).getByText('主演')).not.toHaveClass(
      'bg-brand',
    );
  });

  it('同じ団体の複数の賞をひとつのセルに並べる', () => {
    render(
      <PersonAwardHistory
        credits={[
          {
            movieUid: 'movie-hana-bi',
            title: 'HANA-BI',
            year: 1997,
            personAwards: [
              {
                slug: 'kinema-junpo-director',
                organization: 'キネマ旬報',
                category: '日本映画監督賞',
                year: 1997,
                isWinner: true,
              },
              {
                slug: 'kinema-junpo-lead-actor',
                organization: 'キネマ旬報',
                category: '主演男優賞',
                year: 1997,
                isWinner: false,
              },
            ],
          },
        ]}
      />,
    );

    const cells = within(rowOf(/HANA-BI/)).getAllByRole('cell');
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveTextContent('監督主演');
  });

  it.each([
    ['監督賞', '監督'],
    ['銀熊賞（主演俳優賞）', '主演'],
    ['男優助演賞', '助演'],
    ['ヴォルピ杯 男優賞', '男優'],
    ['女優賞', '女優'],
    ['新人賞', '新人'],
  ])('%s の短縮ラベルは %s', (category, label) => {
    render(
      <PersonAwardHistory
        credits={[
          {
            movieUid: 'movie',
            title: '映画',
            personAwards: [
              {
                organization: 'ベルリン国際映画祭',
                category,
                year: 2000,
                isWinner: true,
              },
            ],
          },
        ]}
      />,
    );

    expect(within(rowOf(/映画/)).getByRole('cell')).toHaveTextContent(label);
  });

  it('個人賞がひとつも無ければ何も描画しない', () => {
    const {container} = render(
      <PersonAwardHistory
        credits={[{movieUid: 'movie-babel', title: 'バベル', personAwards: []}]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
