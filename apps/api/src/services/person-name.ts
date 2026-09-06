import {sql} from 'drizzle-orm';

function personNameIn(languageCode: string) {
  return sql`(
    SELECT translations.content FROM translations
    WHERE translations.resource_uid = people.uid
      AND translations.resource_type = 'person_name'
      AND translations.language_code = ${languageCode}
  )`;
}

export function personLocalizedName(locale: string) {
  if (locale === 'en') {
    return sql<string | null>`${personNameIn('en')}`;
  }

  return sql<
    string | null
  >`COALESCE(${personNameIn(locale)}, ${personNameIn('en')})`;
}
