import {describe, expect, it} from 'vitest';
import {buildOrganizationLabels} from './organization-names';

describe('buildOrganizationLabels', () => {
  it('displayNameがあれば日本語の団体名にする', () => {
    const labels = buildOrganizationLabels([
      {
        organization: {
          name: 'Venice Film Festival',
          displayName: 'ヴェネツィア国際映画祭',
        },
      },
    ]);

    expect(labels).toEqual(['ヴェネツィア国際映画祭']);
  });

  it('賞ページを持たない部門でもdisplayNameを使う', () => {
    const labels = buildOrganizationLabels([
      {
        organization: {
          name: 'Academy Awards',
          shortName: 'Oscars',
          displayName: 'アカデミー賞',
        },
      },
    ]);

    expect(labels).toEqual(['アカデミー賞']);
  });

  it('displayNameが無ければshortNameを使う', () => {
    const labels = buildOrganizationLabels([
      {
        organization: {
          name: 'Kinema Junpo',
          shortName: 'Kinema Junpo Best Ten',
        },
      },
    ]);

    expect(labels).toEqual(['Kinema Junpo Best Ten']);
  });

  it('displayNameもshortNameも無ければnameを使う', () => {
    const labels = buildOrganizationLabels([
      {organization: {name: 'Mainichi Film Awards'}},
    ]);

    expect(labels).toEqual(['Mainichi Film Awards']);
  });

  it('同じ団体の複数部門は1つにまとめる', () => {
    const labels = buildOrganizationLabels([
      {organization: {name: 'Academy Awards', displayName: 'アカデミー賞'}},
      {organization: {name: 'Academy Awards', displayName: 'アカデミー賞'}},
    ]);

    expect(labels).toEqual(['アカデミー賞']);
  });

  it('片方のdisplayNameが欠けた同じ団体を二重に出さない', () => {
    const labels = buildOrganizationLabels([
      {organization: {name: 'Academy Awards', shortName: 'Oscars'}},
      {organization: {name: 'Academy Awards', displayName: 'アカデミー賞'}},
    ]);

    expect(labels).toEqual(['アカデミー賞']);
  });

  it('出現順を保つ', () => {
    const labels = buildOrganizationLabels([
      {organization: {name: 'BAFTA', displayName: '英国アカデミー賞'}},
      {organization: {name: 'Academy Awards', displayName: 'アカデミー賞'}},
    ]);

    expect(labels).toEqual(['英国アカデミー賞', 'アカデミー賞']);
  });
});
