import {eq} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {nominations} from '@shine/database/schema/nominations';
import {type SQLiteSelect} from 'drizzle-orm/sqlite-core';

export function joinAwardContext<Query extends SQLiteSelect>(query: Query) {
  return query
    .innerJoin(
      awardCeremonies,
      eq(awardCeremonies.uid, nominations.ceremonyUid),
    )
    .innerJoin(
      awardOrganizations,
      eq(awardOrganizations.uid, awardCeremonies.organizationUid),
    )
    .innerJoin(
      awardCategories,
      eq(awardCategories.uid, nominations.categoryUid),
    );
}
