import {describe, expect, it} from 'vitest';
import {
  judgeJapanAvailability,
  summarizeJapanAvailability,
} from '../japan-availability';

describe('judgeJapanAvailability', () => {
  it('確認が無ければ未確認', () => {
    expect(judgeJapanAvailability([])).toBe('unchecked');
  });

  it('error だけなら未確認', () => {
    expect(
      judgeJapanAvailability([
        {source: 'tmdb', status: 'error'},
        {source: 'unext', status: 'error'},
      ]),
    ).toBe('unchecked');
  });

  it('全部 ng なら観られない', () => {
    expect(
      judgeJapanAvailability([
        {source: 'tmdb', status: 'ng'},
        {source: 'unext', status: 'ng'},
        {source: 'discas', status: 'ng'},
      ]),
    ).toBe('unwatchable');
  });

  it('ng と error が混ざっていれば観られない', () => {
    expect(
      judgeJapanAvailability([
        {source: 'tmdb', status: 'error'},
        {source: 'unext', status: 'ng'},
      ]),
    ).toBe('unwatchable');
  });

  it('配信の ok が 1 つでもあれば観られる', () => {
    expect(
      judgeJapanAvailability([
        {source: 'tmdb', status: 'ng'},
        {source: 'unext', status: 'ok'},
        {source: 'discas', status: 'ng'},
      ]),
    ).toBe('watchable');
  });

  it('ゲオの ok は観られる', () => {
    expect(
      judgeJapanAvailability([
        {source: 'geo', status: 'ok'},
        {source: 'discas', status: 'ok'},
      ]),
    ).toBe('watchable');
  });

  it('DISCAS だけが ok なら宅配レンタルのみ', () => {
    expect(
      judgeJapanAvailability([
        {source: 'tmdb', status: 'ng'},
        {source: 'unext', status: 'ng'},
        {source: 'discas', status: 'ok'},
      ]),
    ).toBe('rental_only');
  });

  it('DISCAS の ok と他の error なら宅配レンタルのみ', () => {
    expect(
      judgeJapanAvailability([
        {source: 'tmdb', status: 'error'},
        {source: 'discas', status: 'ok'},
      ]),
    ).toBe('rental_only');
  });
});

describe('summarizeJapanAvailability', () => {
  it('判定ごとの本数と合計を数える', () => {
    expect(
      summarizeJapanAvailability([
        'watchable',
        'watchable',
        'rental_only',
        'unwatchable',
        'unchecked',
      ]),
    ).toEqual({
      total: 5,
      watchable: 2,
      rentalOnly: 1,
      unwatchable: 1,
      unchecked: 1,
    });
  });

  it('空なら全部 0', () => {
    expect(summarizeJapanAvailability([])).toEqual({
      total: 0,
      watchable: 0,
      rentalOnly: 0,
      unwatchable: 0,
      unchecked: 0,
    });
  });
});
