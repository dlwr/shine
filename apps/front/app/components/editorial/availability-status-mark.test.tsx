import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AvailabilityStatusMark} from './availability-status-mark';

describe('AvailabilityStatusMark', () => {
  it('観られない作品に印を付ける', () => {
    render(<AvailabilityStatusMark status="unwatchable" />);

    expect(screen.getByText('日本で観られない')).toBeInTheDocument();
  });

  it('宅配レンタルのみの作品には要確認の印を付ける', () => {
    render(<AvailabilityStatusMark status="rental_only" />);

    expect(screen.getByText('宅配レンタルのみ・要確認')).toBeInTheDocument();
  });

  it.each(['watchable', 'unchecked', undefined] as const)(
    '%s には印を付けない',
    status => {
      const {container} = render(<AvailabilityStatusMark status={status} />);

      expect(container).toBeEmptyDOMElement();
    },
  );
});
