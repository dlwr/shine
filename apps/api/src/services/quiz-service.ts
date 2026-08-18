import {and, eq, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {QuizAnswer, QuizCandidate, QuizHint} from '@shine/types';
import {EdgeCache} from '../utils/cache';
import {simpleHash} from '../utils/hash';
import {findAwardPageDefinition} from './awards-service';
import {BaseService} from './base-service';

export const QUIZ_MAX_ATTEMPTS = 6;

const MINIMUM_ORGANIZATIONS = 2;
const POOL_CACHE_KEY = 'quiz:pool:v2';
const POOL_CACHE_TTL = 604_800;

export type QuizPoolEntry = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string;
  originalLanguage: string;
  organizations: string[];
  achievements: string[];
};

/** 賞ページ定義のorganizationが英語のままのもの */
const organizationLabelOverrides: Record<string, string> = {
  '1001 Movies You Must See Before You Die': '死ぬまでに観たい映画1001本',
};

const languageDisplayNames = new Intl.DisplayNames(['ja'], {type: 'language'});

function languageLabel(code: string): string {
  try {
    return languageDisplayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function buildQuizHints(entry: QuizPoolEntry): QuizHint[] {
  const characters = [...entry.title];

  return [
    {label: '製作年', value: entry.year ? `${entry.year}年` : '不明'},
    {label: '原語', value: languageLabel(entry.originalLanguage)},
    {label: '選出した映画賞', value: entry.achievements.join(' / ')},
    {label: '邦題の長さ', value: `${characters.length}文字`},
    {label: '邦題の頭文字', value: characters[0] ?? '?'},
  ];
}

/** ポスターを拡大表示するときに中心へ置く点。日付ごとに変えて絵面を変化させる */
export function quizFocalPoint(date: string): {focalX: number; focalY: number} {
  const seed = simpleHash(`quiz-focal-${date}`);

  return {
    focalX: 0.3 + ((seed % 1000) / 1000) * 0.4,
    focalY: 0.25 + (((seed >>> 10) % 1000) / 1000) * 0.35,
  };
}

export function pickQuizEntry(
  pool: QuizPoolEntry[],
  date: string,
): QuizPoolEntry | undefined {
  if (pool.length === 0) {
    return undefined;
  }

  return pool[simpleHash(`quiz-${date}`) % pool.length];
}

export function toQuizAnswer(
  entry: QuizPoolEntry,
  date: string,
): QuizAnswer & {hints: QuizHint[]} {
  return {
    uid: entry.uid,
    title: entry.title,
    year: entry.year,
    posterUrl: entry.posterUrl,
    ...quizFocalPoint(date),
    hints: buildQuizHints(entry),
  };
}

type NominationFacts = {
  organizationName: string;
  categoryName: string;
  ceremonyYear: number;
  isWinner: boolean;
  specialMention: string | undefined;
};

function describeNomination(facts: NominationFacts): {
  organization: string;
  achievement: string;
} {
  const definition = findAwardPageDefinition(
    facts.organizationName,
    facts.categoryName,
  );
  const organization =
    organizationLabelOverrides[facts.organizationName] ??
    definition?.organization ??
    facts.organizationName;

  if (definition?.grouping === 'list') {
    return {organization, achievement: `${organization}に選出`};
  }

  const outcome =
    facts.specialMention ?? (facts.isWinner ? '受賞' : 'ノミネート');

  return {
    organization,
    achievement: `${organization} ${facts.ceremonyYear}年 ${outcome}`,
  };
}

export class QuizService extends BaseService {
  async getPool(): Promise<QuizPoolEntry[]> {
    const cache = new EdgeCache(undefined, this.env.CACHE_KV);
    const cached = await cache.get(POOL_CACHE_KEY);
    if (cached) {
      return cached.data as QuizPoolEntry[];
    }

    const pool = await this.buildPool();
    await cache.set(POOL_CACHE_KEY, pool, POOL_CACHE_TTL);
    return pool;
  }

  async getCandidates(): Promise<QuizCandidate[]> {
    const pool = await this.getPool();

    return pool.map(entry => ({
      uid: entry.uid,
      title: entry.title,
      year: entry.year,
    }));
  }

  async getEntry(date: string): Promise<QuizPoolEntry | undefined> {
    return pickQuizEntry(await this.getPool(), date);
  }

  private async buildPool(): Promise<QuizPoolEntry[]> {
    const rows = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        ceremonyYear: awardCeremonies.year,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
        title: sql<string>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('title'),
        // 邦題ポスターには答えが刷られているので最後に回す
        posterUrl: sql<string>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY
            CASE WHEN poster_urls.language_code = 'ja' THEN 1 ELSE 0 END ASC,
            poster_urls.is_primary DESC,
            poster_urls.url ASC
          LIMIT 1
        )`.as('posterUrl'),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardCeremonies.organizationUid, awardOrganizations.uid),
      )
      .innerJoin(
        awardCategories,
        eq(nominations.categoryUid, awardCategories.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          isNull(movies.deletedAt),
          sql`EXISTS (
            SELECT 1 FROM translations
            WHERE translations.resource_uid = movies.uid
              AND translations.resource_type = 'movie_title'
              AND translations.language_code = 'ja'
          )`,
          sql`EXISTS (
            SELECT 1 FROM poster_urls WHERE poster_urls.movie_uid = movies.uid
          )`,
        ),
      );

    const entries = new Map<string, QuizPoolEntry>();
    for (const row of rows) {
      const {organization, achievement} = describeNomination({
        organizationName: row.organizationName,
        categoryName: row.categoryName,
        ceremonyYear: row.ceremonyYear,
        isWinner: row.isWinner === 1,
        specialMention: row.specialMention ?? undefined,
      });

      let entry = entries.get(row.uid);
      if (!entry) {
        entry = {
          uid: row.uid,
          title: row.title,
          year: row.year ?? undefined,
          posterUrl: row.posterUrl,
          originalLanguage: row.originalLanguage,
          organizations: [],
          achievements: [],
        };
        entries.set(row.uid, entry);
      }

      if (!entry.organizations.includes(organization)) {
        entry.organizations.push(organization);
      }

      if (!entry.achievements.includes(achievement)) {
        entry.achievements.push(achievement);
      }
    }

    return entries
      .values()
      .filter(entry => entry.organizations.length >= MINIMUM_ORGANIZATIONS)
      .toArray()
      .toSorted((a, b) => a.uid.localeCompare(b.uid));
  }
}
