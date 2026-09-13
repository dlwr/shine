import {
  type AwardEdition,
  type AwardFilm,
  type AwardPerson,
  type ImdbEventAwardConfig,
  type ImdbEventCategory,
  type ImdbEventCollectedData,
  type ImdbEventNomination,
} from './types';

function collectCategoryFilms(
  config: ImdbEventAwardConfig,
  category: ImdbEventCategory,
  filmsByImdbId: Map<string, AwardFilm>,
): void {
  if (!config.isCompetitionCategory(category.category)) {
    return;
  }

  for (const nomination of category.nominations) {
    collectNominationFilms(config, nomination, filmsByImdbId);
  }
}

function collectNominationFilms(
  config: ImdbEventAwardConfig,
  nomination: ImdbEventNomination,
  filmsByImdbId: Map<string, AwardFilm>,
): void {
  const nominated = nomination.people?.map(person => ({
    name: person.name,
    isWinner: nomination.isWinner,
  }));

  for (const title of nomination.titles) {
    const existing = filmsByImdbId.get(title.imdbId);
    if (existing) {
      existing.isWinner ||= nomination.isWinner;
      if (nominated) {
        existing.people = mergePeople(existing.people, nominated);
      }

      continue;
    }

    filmsByImdbId.set(title.imdbId, {
      imdbId: title.imdbId,
      title: title.title,
      originalTitle: title.originalTitle,
      isWinner: nomination.isWinner,
      specialMention:
        config.useNotesAsSpecialMention && nomination.notes
          ? nomination.notes
          : undefined,
      people: nominated,
    });
  }
}

function mergePeople(
  current: AwardPerson[] | undefined,
  incoming: AwardPerson[],
): AwardPerson[] {
  const merged = current ? [...current] : [];

  for (const person of incoming) {
    const existing = merged.find(entry => entry.name === person.name);
    if (existing) {
      existing.isWinner ||= person.isWinner;
    } else {
      merged.push({...person});
    }
  }

  return merged;
}

function applyWinnerCorrections(
  config: ImdbEventAwardConfig,
  year: number,
  filmsByImdbId: Map<string, AwardFilm>,
): void {
  const corrections = config.winnerCorrections ?? [];
  for (const correction of corrections) {
    if (correction.year !== year) {
      continue;
    }

    const film = filmsByImdbId.get(correction.imdbId);
    if (film) {
      film.isWinner = correction.isWinner;
    }
  }
}

export function extractAwardEditions(
  data: ImdbEventCollectedData,
  config: ImdbEventAwardConfig,
): AwardEdition[] {
  const editions: AwardEdition[] = [];

  for (const edition of data.editions) {
    const filmsByImdbId = new Map<string, AwardFilm>();

    for (const award of edition.targetAward) {
      for (const category of award.categories) {
        collectCategoryFilms(config, category, filmsByImdbId);
      }
    }

    applyWinnerCorrections(config, edition.year, filmsByImdbId);

    const films = filmsByImdbId.values().toArray();
    if (films.length < config.minimumFilmsPerEdition) {
      continue;
    }

    editions.push({year: edition.year, films});
  }

  return editions;
}
