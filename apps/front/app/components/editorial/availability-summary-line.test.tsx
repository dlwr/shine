import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AvailabilitySummaryLine} from './availability-summary-line';

const summary = {
  total: 21,
  watchable: 12,
  rentalOnly: 2,
  unwatchable: 5,
  unchecked: 2,
};

describe('AvailabilitySummaryLine', () => {
  it('日本で観られる本数を全体の本数と並べて出す', () => {
    render(<AvailabilitySummaryLine summary={summary} />);

    expect(screen.getByText('日本で観られる 12 / 21 本')).toBeInTheDocument();
  });

  it('宅配レンタルのみの本数を添える', () => {
    render(<AvailabilitySummaryLine summary={summary} />);

    expect(screen.getByText('宅配レンタルのみ 2 本')).toBeInTheDocument();
  });

  it('観られない本数を一覧へのリンクにする', () => {
    render(
      <AvailabilitySummaryLine
        summary={summary}
        unavailableHref="/awards/palme-dor/unavailable"
      />,
    );

    expect(screen.getByRole('link', {name: '観られない 5 本'})).toHaveAttribute(
      'href',
      '/awards/palme-dor/unavailable',
    );
  });

  it('リンク先が無ければ観られない本数を文字で出す', () => {
    render(<AvailabilitySummaryLine summary={summary} />);

    expect(screen.getByText('観られない 5 本')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('宅配レンタルのみと観られないが 0 本なら添えない', () => {
    render(
      <AvailabilitySummaryLine
        summary={{...summary, rentalOnly: 0, unwatchable: 0}}
        unavailableHref="/awards/palme-dor/unavailable"
      />,
    );

    expect(screen.queryByText(/宅配レンタルのみ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/観られない/)).not.toBeInTheDocument();
  });

  it('判定された作品が 1 本も無ければ何も出さない', () => {
    const {container} = render(
      <AvailabilitySummaryLine
        summary={{
          total: 3,
          watchable: 0,
          rentalOnly: 0,
          unwatchable: 0,
          unchecked: 3,
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('集計が無ければ何も出さない', () => {
    const {container} = render(<AvailabilitySummaryLine summary={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });
});
