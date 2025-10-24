import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardOrganizations} from '@shine/database/schema/award-organizations';

export async function seedJapanAcademyAwards(environment: Environment) {
  const database = getDatabase(environment);

  let organization;
  try {
    [organization] = await database
      .insert(awardOrganizations)
      .values({
        name: 'Japan Academy Awards',
        shortName: 'Japan Academy',
        country: 'Japan',
        establishedYear: 1978,
        description:
          'The Japan Academy Awards (日本アカデミー賞) are awards for artistic and technical merit in the Japanese film industry.',
        frequency: 'Annual',
      })
      .returning();
  } catch (error) {
    console.error(error);
    [organization] = await database
      .select()
      .from(awardOrganizations)
      .where(eq(awardOrganizations.name, 'Japan Academy Awards'));

    if (!organization) {
      throw new Error(
        'Failed to insert or find Japan Academy Awards organization',
      );
    }
  }

  const categoriesToInsert = [
    {
      organizationUid: organization.uid,
      name: '最優秀作品賞',
      nameEn: 'Best Picture',
      nameLocal: '最優秀作品賞',
      shortName: 'Best Picture',
      description:
        'The Japan Academy Award for Best Picture is the most prestigious award presented annually by the Japan Academy.',
      firstAwardedYear: 1978,
      isActive: 1,
    },
    {
      organizationUid: organization.uid,
      name: '最優秀アニメーション作品賞',
      nameEn: 'Best Animation',
      nameLocal: '最優秀アニメーション作品賞',
      shortName: 'Best Animation',
      description:
        'The Japan Academy Award for Best Animation is presented annually for the best animated film.',
      firstAwardedYear: 2007,
      isActive: 1,
    },
    {
      organizationUid: organization.uid,
      name: '優秀作品賞',
      nameEn: 'Excellent Picture',
      nameLocal: '優秀作品賞',
      shortName: 'Excellent Picture',
      description:
        'The Japan Academy Award for Excellent Picture is awarded to outstanding films.',
      firstAwardedYear: 1978,
      isActive: 1,
    },
    {
      organizationUid: organization.uid,
      name: '優秀アニメーション作品賞',
      nameEn: 'Excellent Animation',
      nameLocal: '優秀アニメーション作品賞',
      shortName: 'Excellent Animation',
      description:
        'The Japan Academy Award for Excellent Animation is awarded to outstanding animated films.',
      firstAwardedYear: 2007,
      isActive: 1,
    },
  ];

  for (const category of categoriesToInsert) {
    try {
      await database.insert(awardCategories).values(category);
    } catch {
      console.log(`Skipping duplicate category: ${category.name}`);
      continue;
    }
  }

  console.log(
    'Japan Academy Awards organization and categories seeded successfully',
  );
}
