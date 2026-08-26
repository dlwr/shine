import {type Environment} from '@shine/database';
import {
  parseAcademyPersonWikitext,
  type AcademyPersonEdition,
} from './academy-person-wikitext';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './common/wikidata-film-resolver';
import {fetchWikitext} from './common/wikitext';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from './imdb-event-award';

const FIRST_CEREMONY_YEAR = 1929;

export function academyCeremonyYear(ceremonyNumber: number): number {
  return FIRST_CEREMONY_YEAR - 1 + ceremonyNumber;
}

export function academyCeremonyNumber(ceremonyYear: number): number {
  return ceremonyYear - (FIRST_CEREMONY_YEAR - 1);
}

/** 対象は暦年公開の作品。映画祭プレミアや本国公開が前年になることがある */
const PUBLICATION_WINDOW: YearWindow = {min: -2, max: 1};

/** 記事名からIMDb IDを引けない作品を直接指す。キーは「回次:表示名」 */
const RESOLUTION_OVERRIDES = new Map<string, string>();

/** 記事の表記とTMDbのクレジット名が別名で、表記の正規化では寄らないもの */
const PERSON_NAME_ALIASES: Record<string, string> = {
  'Alejandro González Iñárritu': 'Alejandro G. Iñárritu',
  'Michael Cacoyannis': 'Mihalis Kakogiannis',
};

export type AcademyPersonAward = {
  article: string;
  category: string;
  role: 'director' | 'actor';
};

export const ACADEMY_PERSON_AWARDS: AcademyPersonAward[] = [
  {
    article: 'Academy Award for Best Director',
    category: 'Academy Award for Best Director',
    role: 'director',
  },
  {
    article: 'Academy Award for Best Actor',
    category: 'Academy Award for Best Actor',
    role: 'actor',
  },
  {
    article: 'Academy Award for Best Actress',
    category: 'Academy Award for Best Actress',
    role: 'actor',
  },
  {
    article: 'Academy Award for Best Supporting Actor',
    category: 'Academy Award for Best Supporting Actor',
    role: 'actor',
  },
  {
    article: 'Academy Award for Best Supporting Actress',
    category: 'Academy Award for Best Supporting Actress',
    role: 'actor',
  },
];

function referenceKey(entry: AcademyPersonEdition['entries'][number]): string {
  return entry.filmPage ?? entry.filmTitle;
}

export function academyPersonFilmReferences(
  editions: AcademyPersonEdition[],
): FilmReference[] {
  const references = new Map<string, FilmReference>();

  for (const edition of editions) {
    for (const entry of edition.entries) {
      const key = referenceKey(entry);
      if (!references.has(key)) {
        references.set(key, {
          key,
          title: entry.filmTitle,
          targetYear: edition.filmYear,
          yearWindow: PUBLICATION_WINDOW,
        });
      }
    }
  }

  return references.values().toArray();
}

function buildNominations(
  edition: AcademyPersonEdition,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];

  for (const entry of edition.entries) {
    const match = resolved.get(referenceKey(entry));
    const imdbId =
      match?.imdbId ??
      RESOLUTION_OVERRIDES.get(`${edition.ceremonyNumber}:${entry.filmTitle}`);
    if (!imdbId) {
      console.log(
        `Unresolved: #${edition.ceremonyNumber} ${entry.filmTitle} (${entry.personName})`,
      );
      continue;
    }

    nominations.push({
      isWinner: entry.isWinner,
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
      titles: [
        {
          imdbId,
          title: entry.filmTitle,
          originalTitle: match?.englishTitle ?? entry.filmTitle,
        },
      ],
      people: [
        {name: PERSON_NAME_ALIASES[entry.personName] ?? entry.personName},
      ],
    });
  }

  return nominations;
}

export function toImdbEventData(
  award: AcademyPersonAward,
  editions: AcademyPersonEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: `https://en.wikipedia.org/wiki/${award.article.replaceAll(' ', '_')}`,
    editions: editions.map(edition => ({
      year: academyCeremonyYear(edition.ceremonyNumber),
      awardNames: [award.category],
      targetAward: [
        {
          categories: [
            {
              category: award.category,
              total: null, // eslint-disable-line unicorn/no-null -- ImdbEventEditionの型に合わせる
              nominations: buildNominations(edition, resolved),
            },
          ],
        },
      ],
    })),
  };
}

export function academyPersonConfig(
  award: AcademyPersonAward,
): ImdbEventAwardConfig {
  return {
    organizationName: 'Academy Awards',
    organizationCountry: 'United States',
    establishedYear: FIRST_CEREMONY_YEAR,
    categoryName: award.category,
    categoryShortName: award.category.replace('Academy Award for ', ''),
    ceremonyNumber: academyCeremonyNumber,
    isCompetitionCategory: category => category === award.category,
    minimumFilmsPerEdition: 1,
    personRole: award.role,
  };
}

export async function importAcademyPersonAward({
  environment,
  award,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  award: AcademyPersonAward;
  dryRun?: boolean;
  /** 授賞式の年。1929年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const allEditions = parseAcademyPersonWikitext(
    await fetchWikitext(award.article, {language: 'en'}),
  );
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(
          edition => academyCeremonyYear(edition.ceremonyNumber) === year,
        );

  console.log(
    `\n=== ${award.category}: parsed ${editions.length} editions from Wikipedia`,
  );

  const references = academyPersonFilmReferences(editions);
  const pages = references.map(reference => reference.key);

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages, {language: 'en'});
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const dropped = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (dropped > 0) {
    console.log(`Dropped ${dropped} misattributed resolutions`);
  }

  const duplicates = dropDuplicateResolutions(references, resolved);
  if (duplicates > 0) {
    console.log(`Dropped ${duplicates} duplicate resolutions`);
  }

  return importImdbEventAward({
    environment,
    data: toImdbEventData(award, editions, resolved),
    config: academyPersonConfig(award),
    dryRun,
    year,
    throttleMs,
  });
}

export async function importAcademyPersonAwards({
  environment,
  awards = ACADEMY_PERSON_AWARDS,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  awards?: AcademyPersonAward[];
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const total: ImdbEventImportStats = {
    editionsProcessed: 0,
    moviesCreated: 0,
    moviesExisting: 0,
    skippedSoftDeleted: 0,
    nominationsCreated: 0,
    winnersUpdated: 0,
    tmdbNotFound: 0,
    peopleUnresolved: 0,
    failed: 0,
  };

  for (const award of awards) {
    const stats = await importAcademyPersonAward({
      environment,
      award,
      dryRun,
      year,
      throttleMs,
    });

    for (const key of Object.keys(total) as Array<keyof ImdbEventImportStats>) {
      total[key] += stats[key];
    }
  }

  return total;
}
