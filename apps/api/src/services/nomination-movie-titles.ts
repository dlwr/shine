import {and, eq, inArray, inChunks, type getDatabase} from '@shine/database';
import {translations} from '@shine/database/schema/translations';

type Database = ReturnType<typeof getDatabase>;

type TitleEntry = {
  languageCode: string;
  title: string;
  isDefault: number | null;
};

const pickTitle = (
  entries: TitleEntry[],
  originalLanguage: string | undefined,
): string | undefined => {
  const defaultEntry = entries.find(entry => entry.isDefault === 1);
  const jaEntry = entries.find(entry => entry.languageCode === 'ja');
  const originalEntry = originalLanguage
    ? entries.find(entry => entry.languageCode === originalLanguage)
    : undefined;
  const enEntry = entries.find(entry => entry.languageCode === 'en');
  const fallbackEntry = entries[0];

  return (defaultEntry ?? jaEntry ?? originalEntry ?? enEntry ?? fallbackEntry)
    ?.title;
};

/** 既定の題名 → ja → 原語 → en の順で、映画ごとに管理画面で見せる題名を 1 つ選ぶ */
export async function loadNominationMovieTitles(
  database: Database,
  nominationRows: Array<{
    movieUid: string;
    movieOriginalLanguage: string | null;
  }>,
): Promise<Map<string, string>> {
  const titlesMap = new Map<string, string>();
  const movieUids = [...new Set(nominationRows.map(row => row.movieUid))];
  if (movieUids.length === 0) {
    return titlesMap;
  }

  const titleRows = await inChunks(movieUids, chunk =>
    database
      .select({
        movieUid: translations.resourceUid,
        languageCode: translations.languageCode,
        title: translations.content,
        isDefault: translations.isDefault,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceType, 'movie_title'),
          inArray(translations.resourceUid, chunk),
        ),
      ),
  );

  const translationsByMovie = new Map<string, TitleEntry[]>();
  for (const row of titleRows) {
    const trimmedTitle = row.title?.trim();
    if (!trimmedTitle) {
      continue;
    }

    const entries = translationsByMovie.get(row.movieUid) ?? [];
    entries.push({
      languageCode: row.languageCode,
      title: trimmedTitle,
      isDefault: row.isDefault ?? 0,
    });
    translationsByMovie.set(row.movieUid, entries);
  }

  const originalLanguageMap = new Map<string, string>();
  for (const row of nominationRows) {
    if (originalLanguageMap.has(row.movieUid)) {
      continue;
    }

    const originalLanguage = row.movieOriginalLanguage?.trim();
    if (originalLanguage) {
      originalLanguageMap.set(row.movieUid, originalLanguage);
    }
  }

  for (const movieUid of movieUids) {
    const title = pickTitle(
      translationsByMovie.get(movieUid) ?? [],
      originalLanguageMap.get(movieUid),
    );
    if (title) {
      titlesMap.set(movieUid, title);
    }
  }

  return titlesMap;
}
