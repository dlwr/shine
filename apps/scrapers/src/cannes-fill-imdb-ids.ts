import {and, eq, isNull} from 'drizzle-orm';
import {type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {parseCompetitionEntries} from './cannes-palme-dor';
import {getScrapeDatabase} from './common/dry-run';
import {resolveFilmsByWikipediaPage} from './common/wikidata-film-resolver';
import {fetchWikitext} from './common/wikitext';

const ORGANIZATION = 'Cannes Film Festival';
const CATEGORY = "Palme d'Or";

export type ResolvedEntry = {title: string; imdbId: string};
export type UnidentifiedMovie = {movieUid: string; title: string};
export type TitleMatch = UnidentifiedMovie & {imdbId: string};

export type FillImdbIdsStats = {
  unidentified: number;
  filled: number;
  duplicateSkipped: number;
  unmatched: number;
};

function normalize(title: string): string {
  return title.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/** 同じ英題が複数あるものは取り違えるので落とす */
function uniqueByTitle<T extends {title: string}>(items: T[]): Map<string, T> {
  const counts = new Map<string, number>();
  const byTitle = new Map<string, T>();

  for (const item of items) {
    const key = normalize(item.title);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    byTitle.set(key, item);
  }

  return new Map(byTitle.entries().filter(([key]) => counts.get(key) === 1));
}

export function matchByTitle(
  entries: ResolvedEntry[],
  rows: UnidentifiedMovie[],
): TitleMatch[] {
  const entryByTitle = uniqueByTitle(entries);
  const matches: TitleMatch[] = [];

  for (const [key, row] of uniqueByTitle(rows)) {
    const entry = entryByTitle.get(key);
    if (entry) {
      matches.push({...row, imdbId: entry.imdbId});
    }
  }

  return matches;
}

/**
 * 旧スクレイパーが IMDb ID 無しで作った出品作に、記事から引いた IMDb ID を付ける。
 * ID が空だと他の経路が同じ作品を別レコードとして作ってしまう
 */
export async function fillCannesImdbIds({
  environment,
  year,
  dryRun = false,
}: {
  environment: Environment;
  /** 映画祭の開催年 */
  year: number;
  dryRun?: boolean;
}): Promise<FillImdbIdsStats> {
  const database = getScrapeDatabase({environment, isDryRun: dryRun});

  const rows = await database
    .select({movieUid: movies.uid, title: translations.content})
    .from(nominations)
    .innerJoin(movies, eq(movies.uid, nominations.movieUid))
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
    )
    .innerJoin(
      translations,
      and(
        eq(translations.resourceUid, movies.uid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'en'),
      ),
    )
    .where(
      and(
        eq(awardOrganizations.name, ORGANIZATION),
        eq(awardCategories.name, CATEGORY),
        isNull(nominations.personUid),
        eq(awardCeremonies.year, year),
        isNull(movies.imdbId),
        isNull(movies.deletedAt),
      ),
    );

  const stats: FillImdbIdsStats = {
    unidentified: rows.length,
    filled: 0,
    duplicateSkipped: 0,
    unmatched: 0,
  };

  if (rows.length === 0) {
    console.log(`${year}: IMDb ID の無い出品作はありません`);
    return stats;
  }

  const entries = parseCompetitionEntries(
    await fetchWikitext(`${year} Cannes Film Festival`, {language: 'en'}),
  );

  if (entries.length === 0) {
    throw new Error(
      `${year} Cannes Film Festivalの記事からコンペティション部門の表を読めませんでした`,
    );
  }

  const resolved = await resolveFilmsByWikipediaPage(
    entries.map(entry => entry.filmPage ?? entry.filmTitle),
    {language: 'en'},
  );

  const resolvedEntries = entries.flatMap(entry => {
    const imdbId = resolved.get(entry.filmPage ?? entry.filmTitle)?.imdbId;
    return imdbId ? [{title: entry.filmTitle, imdbId}] : [];
  });

  const matches = matchByTitle(resolvedEntries, rows);
  stats.unmatched = rows.length - matches.length;

  for (const match of matches) {
    // ユニーク制約は soft-deleted 行も含むので deletedAt で絞らない
    const [duplicate] = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.imdbId, match.imdbId))
      .limit(1);

    if (duplicate) {
      console.log(
        `  重複: ${match.title} の ${match.imdbId} は既に ${duplicate.uid} が持っています`,
      );
      stats.duplicateSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] ${match.title}: ${match.imdbId}`);
    } else {
      await database
        .update(movies)
        .set({imdbId: match.imdbId})
        .where(eq(movies.uid, match.movieUid));
      console.log(`  ${match.title}: ${match.imdbId}`);
    }

    stats.filled++;
  }

  console.log(
    `${year}: IMDb ID 無し ${stats.unidentified} / 付与 ${stats.filled} / 重複 ${stats.duplicateSkipped} / 未一致 ${stats.unmatched}`,
  );

  return stats;
}
