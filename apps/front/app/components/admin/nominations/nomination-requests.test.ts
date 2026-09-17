import {describe, expect, it} from 'vitest';
import {
  createNominationRequest,
  deleteNominationRequest,
  isNewNominationComplete,
  updateNominationRequest,
} from './nomination-requests';

const apiUrl = 'http://localhost:8787';

const newNomination = {
  organizationUid: 'org-1',
  ceremonyUid: 'ceremony-1',
  categoryUid: 'category-1',
  isWinner: false,
  specialMention: '',
};

const bodyOf = (init: RequestInit) =>
  JSON.parse(init.body as string) as unknown;

describe('isNewNominationComplete', () => {
  it('組織・授賞式・部門がそろえば true', () => {
    expect(isNewNominationComplete(newNomination)).toBe(true);
  });

  it('部門が未選択なら false', () => {
    expect(isNewNominationComplete({...newNomination, categoryUid: ''})).toBe(
      false,
    );
  });
});

describe('createNominationRequest', () => {
  it('映画のノミネート一覧に POST する', () => {
    const {url, init} = createNominationRequest(
      apiUrl,
      'movie-1',
      newNomination,
    );

    expect([url, init.method]).toEqual([
      'http://localhost:8787/admin/movies/movie-1/nominations',
      'POST',
    ]);
  });

  it('特記事項の前後の空白を落とす', () => {
    const {init} = createNominationRequest(apiUrl, 'movie-1', {
      ...newNomination,
      specialMention: ' 特別賞 ',
    });

    expect(bodyOf(init)).toMatchObject({specialMention: '特別賞'});
  });

  it('組織は送らない', () => {
    const {init} = createNominationRequest(apiUrl, 'movie-1', newNomination);

    expect(bodyOf(init)).not.toHaveProperty('organizationUid');
  });
});

describe('updateNominationRequest', () => {
  it('ノミネートに PUT する', () => {
    const {url, init} = updateNominationRequest(apiUrl, 'nomination-1', {
      isWinner: true,
      specialMention: '',
    });

    expect([url, init.method]).toEqual([
      'http://localhost:8787/admin/nominations/nomination-1',
      'PUT',
    ]);
  });

  it('空白だけの特記事項は送らない', () => {
    const {init} = updateNominationRequest(apiUrl, 'nomination-1', {
      isWinner: true,
      specialMention: '  ',
    });

    expect(bodyOf(init)).toEqual({isWinner: true});
  });
});

describe('deleteNominationRequest', () => {
  it('ノミネートに DELETE する', () => {
    const {url, init} = deleteNominationRequest(apiUrl, 'nomination-1');

    expect([url, init.method]).toEqual([
      'http://localhost:8787/admin/nominations/nomination-1',
      'DELETE',
    ]);
  });
});
