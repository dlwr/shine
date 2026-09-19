import {hasJapaneseText} from '@shine/availability';
import {
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventNomination,
} from '../imdb-event-award';
import {type FilmReference, type YearWindow} from './film-resolution-checks';
import {type ResolvedFilm} from './wikidata-film-resolver';
import {filmKey, type WikiFilm} from './ja-wikipedia-film-award-wikitext';

type FilmAwardCategory<Edition, Film extends WikiFilm> = {
  category: string;
  films: (edition: Edition) => Film[];
  /** 外国映画が対象の部門。日本公開が本国より遅れるので同定の年の窓を広げる */
  foreign?: boolean;
  /** 省略すると全作品を受賞として取り込む */
  nomination?: (film: Film) => {isWinner: boolean; notes: string | null};
};

export type FilmAwardSource<
  Edition extends {year: number},
  Film extends WikiFilm = WikiFilm,
> = {
  /** 日本語版Wikipediaの記事名 */
  article: string;
  organizationName: string;
  establishedYear: number;
  ceremonyNumber: (year: number) => number | undefined;
  categories: Array<FilmAwardCategory<Edition, Film>>;
  /** `年度:題名` → IMDb ID。記事名から引けない作品を直接指す */
  resolutionOverrides?: ReadonlyMap<string, string>;
  useNotesAsSpecialMention?: boolean;
  /** ベストテンは同じ映画が複数の年に出ることがあるので、重複を落とさず報告だけにする */
  keepDuplicateResolutions?: boolean;
  logUnresolved?: boolean;
};

/** 日本映画は選考年度＝公開年。年末公開が翌年扱いになることはある */
const JAPANESE_PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 外国映画は本国公開の後に日本公開されるので選考年度より前になる */
const FOREIGN_PUBLICATION_WINDOW: YearWindow = {min: -Infinity, max: 1};

function overrideImdbId<Edition extends {year: number}, Film extends WikiFilm>(
  source: FilmAwardSource<Edition, Film>,
  year: number,
  film: Film,
): string | undefined {
  return source.resolutionOverrides?.get(`${year}:${film.title}`);
}

export function filmsOf<Edition extends {year: number}, Film extends WikiFilm>(
  source: FilmAwardSource<Edition, Film>,
  edition: Edition,
): Array<{film: Film; category: FilmAwardCategory<Edition, Film>}> {
  return source.categories.flatMap(category =>
    category.films(edition).map(film => ({film, category})),
  );
}

export function filmAwardReferences<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  editions: Edition[],
): FilmReference[] {
  return editions.flatMap(edition =>
    filmsOf(source, edition)
      .filter(
        ({film}) => overrideImdbId(source, edition.year, film) === undefined,
      )
      .map(({film, category}) => ({
        key: filmKey(film),
        title: film.title,
        targetYear: edition.year,
        yearWindow: category.foreign
          ? FOREIGN_PUBLICATION_WINDOW
          : JAPANESE_PUBLICATION_WINDOW,
        foreign: category.foreign === true,
      })),
  );
}

function buildNominations<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  edition: Edition,
  category: FilmAwardCategory<Edition, Film>,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];
  const seen = new Set<string>();

  for (const film of category.films(edition)) {
    const imdbId = overrideImdbId(source, edition.year, film);
    const match: ResolvedFilm | undefined =
      imdbId === undefined ? resolved.get(filmKey(film)) : {imdbId};
    if (!match || seen.has(match.imdbId)) {
      continue;
    }

    seen.add(match.imdbId);
    const {isWinner, notes} = category.nomination?.(film) ?? {
      isWinner: true,
      notes: null,
    };
    nominations.push({
      isWinner,
      notes,
      titles: [
        {
          imdbId: match.imdbId,
          title: film.title,
          originalTitle: match.englishTitle ?? null,
        },
      ],
    });
  }

  return nominations;
}

export function toFilmAwardEventData<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  editions: Edition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: `https://ja.wikipedia.org/wiki/${source.article.replaceAll(' ', '_')}`,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: source.categories.map(category => category.category),
        targetAward: [
          {
            categories: source.categories.map(category => ({
              category: category.category,
              total: null,
              nominations: buildNominations(
                source,
                edition,
                category,
                resolved,
              ),
            })),
          },
        ],
      }))
      .filter(edition =>
        edition.targetAward[0].categories.some(
          category => category.nominations.length > 0,
        ),
      ),
  };
}

export function filmAwardConfig<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  categoryName: string,
): ImdbEventAwardConfig {
  if (source.categories.every(entry => entry.category !== categoryName)) {
    throw new Error(`${source.article}に部門「${categoryName}」は無い`);
  }

  return {
    organizationName: source.organizationName,
    organizationCountry: 'Japan',
    establishedYear: source.establishedYear,
    ceremonyNumber: source.ceremonyNumber,
    categoryName,
    isCompetitionCategory: category => category === categoryName,
    minimumFilmsPerEdition: 1,
    useNotesAsSpecialMention: source.useNotesAsSpecialMention,
  };
}

export function collectJapaneseTitles<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  editions: Edition[],
  resolved: Map<string, ResolvedFilm>,
): Map<string, string> {
  const titleByImdbId = new Map<string, string>();

  for (const edition of editions) {
    for (const {film} of filmsOf(source, edition)) {
      const imdbId =
        overrideImdbId(source, edition.year, film) ??
        resolved.get(filmKey(film))?.imdbId;
      if (
        imdbId !== undefined &&
        hasJapaneseText(film.title) &&
        !titleByImdbId.has(imdbId)
      ) {
        titleByImdbId.set(imdbId, film.title);
      }
    }
  }

  return titleByImdbId;
}
