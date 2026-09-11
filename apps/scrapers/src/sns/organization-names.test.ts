import {describe, expect, it} from 'vitest';
import {buildOrganizationLabels} from './organization-names';

const AWARDS = [
  {slug: 'venice-golden-lion', organization: 'ヴェネツィア国際映画祭'},
  {slug: 'academy-best-picture', organization: 'アカデミー賞'},
  {slug: 'academy-best-director', organization: 'アカデミー賞'},
  {slug: 'bafta-best-film', organization: '英国アカデミー賞'},
];

describe('buildOrganizationLabels', () => {
  it('slugが賞ページにあれば日本語の団体名にする', () => {
    const labels = buildOrganizationLabels(
      [
        {
          organization: {
            name: 'Venice Film Festival',
            slug: 'venice-golden-lion',
          },
        },
      ],
      AWARDS,
    );

    expect(labels).toEqual(['ヴェネツィア国際映画祭']);
  });

  it('賞ページに無いslugはshortNameを使う', () => {
    const labels = buildOrganizationLabels(
      [
        {
          organization: {
            name: 'Kinema Junpo',
            shortName: 'Kinema Junpo Best Ten',
            slug: 'kinema-junpo-best-ten',
          },
        },
      ],
      AWARDS,
    );

    expect(labels).toEqual(['Kinema Junpo Best Ten']);
  });

  it('slugが無ければnameを使う', () => {
    const labels = buildOrganizationLabels(
      [{organization: {name: 'Mainichi Film Awards'}}],
      AWARDS,
    );

    expect(labels).toEqual(['Mainichi Film Awards']);
  });

  it('同じ団体の複数部門は1つにまとめる', () => {
    const labels = buildOrganizationLabels(
      [
        {organization: {name: 'Academy Awards', slug: 'academy-best-picture'}},
        {organization: {name: 'Academy Awards', slug: 'academy-best-picture'}},
      ],
      AWARDS,
    );

    expect(labels).toEqual(['アカデミー賞']);
  });

  it('同じ団体の別部門ページでもまとめる', () => {
    const labels = buildOrganizationLabels(
      [
        {organization: {name: 'Academy Awards', slug: 'academy-best-picture'}},
        {organization: {name: 'Academy Awards', slug: 'academy-best-director'}},
      ],
      AWARDS,
    );

    expect(labels).toEqual(['アカデミー賞']);
  });

  it('片方のslugだけ賞ページにある同じ団体を二重に出さない', () => {
    const labels = buildOrganizationLabels(
      [
        {
          organization: {
            name: 'Venice Film Festival',
            slug: 'venice-golden-lion',
          },
        },
        {
          organization: {
            name: 'Venice Film Festival',
            slug: 'venice-marcello-mastroianni',
          },
        },
      ],
      AWARDS,
    );

    expect(labels).toEqual(['ヴェネツィア国際映画祭']);
  });

  it('出現順を保つ', () => {
    const labels = buildOrganizationLabels(
      [
        {organization: {name: 'BAFTA', slug: 'bafta-best-film'}},
        {organization: {name: 'Academy Awards', slug: 'academy-best-picture'}},
      ],
      AWARDS,
    );

    expect(labels).toEqual(['英国アカデミー賞', 'アカデミー賞']);
  });
});
