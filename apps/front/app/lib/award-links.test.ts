import {describe, expect, it} from 'vitest';
import {awardSlugForOrganization} from './award-links';

describe('awardSlugForOrganization', () => {
  it('既知の組織名からslugを返す', () => {
    expect(awardSlugForOrganization('Cannes Film Festival')).toBe('palme-dor');
  });

  it('日本アカデミー賞のslugを返す', () => {
    expect(awardSlugForOrganization('Japan Academy Awards')).toBe(
      'japan-academy-best-picture',
    );
  });

  it('未知の組織名にはundefinedを返す', () => {
    expect(awardSlugForOrganization('Unknown Org')).toBeUndefined();
  });
});
