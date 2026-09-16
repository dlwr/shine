import {describe, expect, it} from 'vitest';
import {groupNominationsByOrganization} from './nominations-by-organization';

const academy = {uid: 'org-a', name: 'Academy Awards', shortName: 'Oscars'};
const cannes = {uid: 'org-c', name: 'Cannes Film Festival'};
const ceremony2020 = {uid: 'cer-2020', year: 2020};
const ceremony2021 = {uid: 'cer-2021', year: 2021};
const cannes2020 = {uid: 'cer-c-2020', year: 2020};

describe('groupNominationsByOrganization', () => {
  it('団体ごと、授賞式ごとに入れ子にする', () => {
    const groups = groupNominationsByOrganization([
      {
        uid: 'n1',
        isWinner: true,
        category: {name: 'Best Picture'},
        ceremony: ceremony2020,
        organization: academy,
      },
      {
        uid: 'n2',
        isWinner: false,
        category: {name: 'Best Director'},
        ceremony: ceremony2020,
        organization: academy,
      },
      {
        uid: 'n3',
        isWinner: false,
        category: {name: 'Best Picture'},
        ceremony: ceremony2021,
        organization: academy,
      },
      {
        uid: 'n4',
        isWinner: true,
        category: {name: "Palme d'Or"},
        ceremony: cannes2020,
        organization: cannes,
      },
    ]);

    expect(groups.map(group => group.organization.uid)).toEqual([
      'org-a',
      'org-c',
    ]);
    expect(groups[0].ceremonies.map(ceremony => ceremony.ceremony.uid)).toEqual(
      ['cer-2020', 'cer-2021'],
    );
    expect(
      groups[0].ceremonies[0].nominations.map(nomination => nomination.uid),
    ).toEqual(['n1', 'n2']);
    expect(
      groups[1].ceremonies[0].nominations.map(nomination => nomination.uid),
    ).toEqual(['n4']);
  });

  it('団体の順は最初に現れた順を保つ', () => {
    const groups = groupNominationsByOrganization([
      {
        uid: 'n1',
        isWinner: false,
        category: {name: 'x'},
        ceremony: cannes2020,
        organization: cannes,
      },
      {
        uid: 'n2',
        isWinner: false,
        category: {name: 'y'},
        ceremony: ceremony2020,
        organization: academy,
      },
      {
        uid: 'n3',
        isWinner: false,
        category: {name: 'z'},
        ceremony: cannes2020,
        organization: cannes,
      },
    ]);

    expect(groups.map(group => group.organization.uid)).toEqual([
      'org-c',
      'org-a',
    ]);
    expect(groups[0].ceremonies[0].nominations).toHaveLength(2);
  });

  it('空なら空', () => {
    expect(groupNominationsByOrganization([])).toEqual([]);
  });
});
