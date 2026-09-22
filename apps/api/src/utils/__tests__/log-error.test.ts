import {afterEach, describe, expect, it, vi} from 'vitest';
import {logErrorWithCause} from '../log-error';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logErrorWithCause', () => {
  it('見出しとエラーをそのまま出す', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    logErrorWithCause('Cache load failed:', error);

    expect(log).toHaveBeenCalledWith('Cache load failed:', error);
  });

  it('元になったエラーを名前と文面で出す', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new DOMException('The operation timed out', 'TimeoutError');

    logErrorWithCause('Cache load failed:', new Error('Failed query', {cause}));

    expect(log).toHaveBeenCalledWith(
      'Caused by:',
      'TimeoutError: The operation timed out',
    );
  });

  it('元になったエラーがエラーでなければ文字列にして出す', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    logErrorWithCause('failed:', new Error('boom', {cause: 'socket closed'}));

    expect(log).toHaveBeenCalledWith('Caused by:', 'socket closed');
  });

  it('元になったエラーが無ければ 1 行だけ出す', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    logErrorWithCause('failed:', new Error('boom'));

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('エラー以外を渡されても落ちない', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    logErrorWithCause('failed:', 'plain string');

    expect(log).toHaveBeenCalledTimes(1);
  });
});
