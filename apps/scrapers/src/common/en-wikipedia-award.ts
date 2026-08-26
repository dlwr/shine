import {type Environment} from '@shine/database';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from '../imdb-event-award';
import {
  parseFilmAwardWikitext,
  parsePersonAwardWikitext,
  type AwardEdition,
  type FilmAwardEntry,
} from './award-table-wikitext';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './wikidata-film-resolver';
import {fetchWikitext} from './wikitext';

export type PersonRole = 'director' | 'actor';

export type EnWikipediaAward = {
  article: string;
  category: string;
  /** 個人賞のとき、人物をどのクレジットから引き当てるか。無ければ作品賞 */
  role?: PersonRole;
};

export type EnWikipediaAwardSource = {
  organizationName: string;
  organizationCountry: string;
  /** 第1回の授賞式の年 */
  firstCeremonyYear: number;
  /** 回次リンクの記事名。[[22nd British Academy Film Awards|22nd]] なら 'British Academy Film Awards' */
  ceremonyPage: string;
  /** 部門名から取り除いて短縮名にする接頭辞 */
  categoryPrefix: string;
  publicationWindow: YearWindow;
  /** 記事名からIMDb IDを引けない作品を直接指す。キーは「回次:表示名」 */
  resolutionOverrides: ReadonlyMap<string, string>;
  /** 記事の表記とTMDbのクレジット名が別名で、表記の正規化では寄らないもの */
  personNameAliases: Readonly<Record<string, string>>;
};

export type EnWikipediaAwardEntry = FilmAwardEntry & {personName?: string};

export type EnWikipediaAwardEdition = AwardEdition<EnWikipediaAwardEntry>;

export function ceremonyYearOf(
  source: EnWikipediaAwardSource,
  ceremonyNumber: number,
): number {
  return source.firstCeremonyYear - 1 + ceremonyNumber;
}

export function ceremonyNumberOf(
  source: EnWikipediaAwardSource,
  ceremonyYear: number,
): number {
  return ceremonyYear - (source.firstCeremonyYear - 1);
}

function referenceKey(entry: EnWikipediaAwardEntry): string {
  return entry.filmPage ?? entry.filmTitle;
}

export function awardFilmReferences(
  source: EnWikipediaAwardSource,
  editions: EnWikipediaAwardEdition[],
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
          yearWindow: source.publicationWindow,
        });
      }
    }
  }

  return references.values().toArray();
}

function buildNominations(
  source: EnWikipediaAwardSource,
  edition: EnWikipediaAwardEdition,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];

  for (const entry of edition.entries) {
    const match = resolved.get(referenceKey(entry));
    const imdbId =
      match?.imdbId ??
      source.resolutionOverrides.get(
        `${edition.ceremonyNumber}:${entry.filmTitle}`,
      );
    if (!imdbId) {
      const person = entry.personName ? ` (${entry.personName})` : '';
      console.log(
        `Unresolved: #${edition.ceremonyNumber} ${entry.filmTitle}${person}`,
      );
      continue;
    }

    const nomination: ImdbEventNomination = {
      isWinner: entry.isWinner,
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
      titles: [
        {
          imdbId,
          title: entry.filmTitle,
          originalTitle: match?.englishTitle ?? entry.filmTitle,
        },
      ],
    };
    if (entry.personName !== undefined) {
      nomination.people = [
        {name: source.personNameAliases[entry.personName] ?? entry.personName},
      ];
    }

    nominations.push(nomination);
  }

  return nominations;
}

export function toImdbEventData(
  source: EnWikipediaAwardSource,
  award: EnWikipediaAward,
  editions: EnWikipediaAwardEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: `https://en.wikipedia.org/wiki/${award.article.replaceAll(' ', '_')}`,
    editions: editions.map(edition => ({
      year: ceremonyYearOf(source, edition.ceremonyNumber),
      awardNames: [award.category],
      targetAward: [
        {
          categories: [
            {
              category: award.category,
              total: null, // eslint-disable-line unicorn/no-null -- ImdbEventEditionの型に合わせる
              nominations: buildNominations(source, edition, resolved),
            },
          ],
        },
      ],
    })),
  };
}

export function awardConfig(
  source: EnWikipediaAwardSource,
  award: EnWikipediaAward,
): ImdbEventAwardConfig {
  return {
    organizationName: source.organizationName,
    organizationCountry: source.organizationCountry,
    establishedYear: source.firstCeremonyYear,
    categoryName: award.category,
    categoryShortName: award.category.replace(source.categoryPrefix, ''),
    ceremonyNumber: year => ceremonyNumberOf(source, year),
    isCompetitionCategory: category => category === award.category,
    minimumFilmsPerEdition: 1,
    personRole: award.role,
  };
}

export function parseAwardEditions(
  source: EnWikipediaAwardSource,
  award: EnWikipediaAward,
  wikitext: string,
): EnWikipediaAwardEdition[] {
  const options = {ceremonyPage: source.ceremonyPage};
  return award.role === undefined
    ? parseFilmAwardWikitext(wikitext, options)
    : parsePersonAwardWikitext(wikitext, options);
}

export async function importEnWikipediaAward({
  environment,
  source,
  award,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  source: EnWikipediaAwardSource;
  award: EnWikipediaAward;
  dryRun?: boolean;
  /** 授賞式の年 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const allEditions = parseAwardEditions(
    source,
    award,
    await fetchWikitext(award.article, {language: 'en'}),
  );
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(
          edition => ceremonyYearOf(source, edition.ceremonyNumber) === year,
        );

  console.log(
    `\n=== ${award.category}: parsed ${editions.length} editions from Wikipedia`,
  );

  const references = awardFilmReferences(source, editions);
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
    data: toImdbEventData(source, award, editions, resolved),
    config: awardConfig(source, award),
    dryRun,
    year,
    throttleMs,
  });
}

export async function importEnWikipediaAwards({
  environment,
  source,
  awards,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  source: EnWikipediaAwardSource;
  awards: EnWikipediaAward[];
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
    const stats = await importEnWikipediaAward({
      environment,
      source,
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
