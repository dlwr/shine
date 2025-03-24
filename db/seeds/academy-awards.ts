import { database } from "../index";
import { awardCategories } from "../schema/award-categories";
import { awardOrganizations } from "../schema/award-organizations";

export async function seedAcademyAwards() {
  const [organization] = await database
    .insert(awardOrganizations)
    .values({
      name: "Academy Awards",
      shortName: "Oscars",
      country: "United States",
      establishedYear: 1929,
      description:
        "The Academy Awards, also known as the Oscars, are awards for artistic and technical merit in the film industry.",
      frequency: "Annual",
    })
    .returning();

  await database.insert(awardCategories).values([
    {
      organizationUid: organization.uid,
      name: "Academy Award for Best Picture",
      nameEn: "Academy Award for Best Picture",
      shortName: "Best Picture",
      description:
        "The Academy Award for Best Picture is one of the Academy Awards presented annually by the Academy of Motion Picture Arts and Sciences (AMPAS).",
      firstAwardedYear: 1929,
      isActive: true,
    },
    {
      organizationUid: organization.uid,
      name: "Academy Award for Outstanding Picture",
      nameEn: "Academy Award for Outstanding Picture",
      shortName: "Outstanding Picture",
      description:
        "Former name of the Academy Award for Best Picture (1929-1940)",
      firstAwardedYear: 1929,
      discontinuedYear: 1940,
      isActive: false,
    },
    {
      organizationUid: organization.uid,
      name: "Academy Award for Outstanding Motion Picture",
      nameEn: "Academy Award for Outstanding Motion Picture",
      shortName: "Outstanding Motion Picture",
      description:
        "Former name of the Academy Award for Best Picture (1941-1944)",
      firstAwardedYear: 1941,
      discontinuedYear: 1944,
      isActive: false,
    },
  ]);
}
