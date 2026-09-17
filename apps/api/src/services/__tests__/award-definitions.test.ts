import {describe, expect, it} from 'vitest';
import {
  awardPageDefinitions,
  personAwardDefinitions,
} from '../award-definitions';

describe('award definitions', () => {
  it('作品賞と個人賞の slug は重ならない', () => {
    const slugs = [...awardPageDefinitions, ...personAwardDefinitions].map(
      definition => definition.slug,
    );

    expect(
      slugs.filter((slug, index) => slugs.indexOf(slug) !== index),
    ).toEqual([]);
  });
});
