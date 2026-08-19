import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {CreditsList, type MovieCredits} from './credits-list';

const credits: MovieCredits = {
  cast: [
    {uid: 'p1', name: 'ロバート・デ・ニーロ', character: 'Travis Bickle'},
    {uid: 'p2', name: 'ジョディ・フォスター', character: 'Iris'},
  ],
  crew: [
    {uid: 'p3', name: 'マーティン・スコセッシ', job: 'Director'},
    {uid: 'p4', name: 'ポール・シュレイダー', job: 'Screenplay'},
  ],
};

describe('CreditsList', () => {
  it('職種を日本語で見出しにする', () => {
    render(<CreditsList credits={credits} />);

    expect(screen.getByText('監督')).toBeInTheDocument();
  });

  it('同じ職種の人をまとめる', () => {
    render(
      <CreditsList
        credits={{
          cast: [],
          crew: [
            {uid: 'p3', name: '黒澤明', job: 'Screenplay'},
            {uid: 'p5', name: '橋本忍', job: 'Screenplay'},
          ],
        }}
      />,
    );

    expect(screen.getByRole('definition')).toHaveTextContent('黒澤明、橋本忍');
  });

  it('出演者を役名つきで並べる', () => {
    render(<CreditsList credits={credits} />);

    expect(screen.getByText(/Travis Bickle/)).toBeInTheDocument();
  });

  it('出演者がいなければ出演の節を出さない', () => {
    render(<CreditsList credits={{cast: [], crew: credits.crew}} />);

    expect(screen.queryByText('出演')).not.toBeInTheDocument();
  });

  it('スタッフがいなければ職種の見出しを出さない', () => {
    render(<CreditsList credits={{cast: credits.cast, crew: []}} />);

    expect(screen.queryByText('監督')).not.toBeInTheDocument();
  });

  it('人名から人物ページへリンクする', () => {
    render(<CreditsList credits={credits} />);

    expect(
      screen.getByRole('link', {name: 'マーティン・スコセッシ'}),
    ).toHaveAttribute('href', '/people/p3');
  });
});
