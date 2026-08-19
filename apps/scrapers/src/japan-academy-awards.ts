import {type Environment} from '@shine/database';
import {resolveRemainingByTmdb} from './common/tmdb-film-resolver';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './common/wikidata-film-resolver';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from './imdb-event-award';
import {
  fetchJapanAcademyWikitext,
  parseJapanAcademyWikitext,
  SOURCE_URL,
  type JapanAcademyEdition,
} from './japan-academy-wikitext';

export const JAPAN_ACADEMY_CATEGORY = '優秀作品賞';

/** 対象期間は前年12月16日〜当年12月15日。映画祭プレミアで前年公開になることはある */
const PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 1977年の映画を対象とした1978年の授賞式が第1回 */
export function japanAcademyCeremonyNumber(ceremonyYear: number): number {
  return ceremonyYear - 1977;
}

export function japanAcademyFilmReferences(
  editions: JapanAcademyEdition[],
): FilmReference[] {
  return editions.flatMap(edition =>
    edition.films.map(film => ({
      key: film.page,
      title: film.title,
      targetYear: edition.year,
      yearWindow: PUBLICATION_WINDOW,
      foreign: false,
    })),
  );
}

function buildNominations(
  edition: JapanAcademyEdition,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];
  const seen = new Set<string>();

  for (const film of edition.films) {
    const match = resolved.get(film.page);
    if (!match || seen.has(match.imdbId)) {
      continue;
    }

    seen.add(match.imdbId);
    nominations.push({
      isWinner: film.isWinner,
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
      titles: [
        {
          imdbId: match.imdbId,
          title: film.title,
          originalTitle: match.englishTitle ?? null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationTitleの型に合わせる
        },
      ],
    });
  }

  return nominations;
}

export function toImdbEventData(
  editions: JapanAcademyEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: SOURCE_URL,
    editions: editions.map(edition => ({
      year: edition.year + 1,
      awardNames: [JAPAN_ACADEMY_CATEGORY],
      targetAward: [
        {
          categories: [
            {
              category: JAPAN_ACADEMY_CATEGORY,
              total: null, // eslint-disable-line unicorn/no-null -- ImdbEventEditionの型に合わせる
              nominations: buildNominations(edition, resolved),
            },
          ],
        },
      ],
    })),
  };
}

export const japanAcademyConfig: ImdbEventAwardConfig = {
  organizationName: 'Japan Academy Awards',
  organizationCountry: 'Japan',
  establishedYear: 1978,
  categoryName: JAPAN_ACADEMY_CATEGORY,
  ceremonyNumber: japanAcademyCeremonyNumber,
  isCompetitionCategory: category => category === JAPAN_ACADEMY_CATEGORY,
  minimumFilmsPerEdition: 1,
};

export async function importJapanAcademyAwards({
  environment,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  dryRun?: boolean;
  /** 授賞式の年。1978年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const allEditions = parseJapanAcademyWikitext(
    await fetchJapanAcademyWikitext(),
  );
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year + 1 === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const pages = [
    ...new Set(
      editions.flatMap(edition => edition.films).map(film => film.page),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const references = japanAcademyFilmReferences(editions);
  const dropped = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (dropped > 0) {
    console.log(`Dropped ${dropped} misattributed resolutions`);
  }

  await resolveRemainingByTmdb({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });

  // 同じ映画が複数の年に選ばれることは無いので、重複した同定は両方捨てる
  const duplicates = dropDuplicateResolutions(references, resolved);
  if (duplicates > 0) {
    console.log(`Dropped ${duplicates} duplicate resolutions`);
  }

  return importImdbEventAward({
    environment,
    data: toImdbEventData(editions, resolved),
    config: japanAcademyConfig,
    dryRun,
    year,
    throttleMs,
  });
}
