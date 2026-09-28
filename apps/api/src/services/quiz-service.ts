import {eq} from '@shine/database';
import {quizSelections} from '@shine/database/schema/quiz-selections';
import type {QuizCandidate} from '../types/quiz';
import {
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  type RequestContext,
} from '../utils/cache';
import {simpleHash} from '../utils/hash';
import {readThroughCache, STALE_RETENTION} from '../utils/read-through-cache';
import type {Environment} from '@shine/database';
import {BaseService} from './base-service';
import {queryQuizPool, type QuizPoolEntry} from './quiz-pool-query';

export const QUIZ_MAX_ATTEMPTS = 6;

const POOL_CACHE_KEY = 'quiz:pool:v3';
const POOL_SIZE_CACHE_KEY = `${POOL_CACHE_KEY}:size`;
const POOL_CACHE_TTL = 604_800;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickQuizEntry(
  pool: QuizPoolEntry[],
  date: string,
): QuizPoolEntry | undefined {
  if (pool.length === 0) {
    return undefined;
  }

  return pool[simpleHash(`quiz-${date}`) % pool.length];
}

export class QuizService extends BaseService {
  private readonly requestContext: RequestContext | undefined;

  constructor(environment: Environment, requestContext?: RequestContext) {
    super(environment);
    this.requestContext = requestContext;
  }

  async getPool(): Promise<QuizPoolEntry[]> {
    const cache = new EdgeCache(this.env.CACHE_KV);
    const {data} = await readThroughCache(this.requestContext, cache, {
      key: POOL_CACHE_KEY,
      ttl: POOL_CACHE_TTL,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => {
        const pool = await queryQuizPool(this.database);
        await cache.set(POOL_SIZE_CACHE_KEY, pool.length, POOL_CACHE_TTL, {
          staleRetention: STALE_RETENTION,
        });
        return pool;
      },
    });

    return data ?? [];
  }

  async getPoolSize(): Promise<number> {
    const cache = new EdgeCache(this.env.CACHE_KV);
    const {data} = await readThroughCache(this.requestContext, cache, {
      key: POOL_SIZE_CACHE_KEY,
      ttl: POOL_CACHE_TTL,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => {
        const {length} = await this.getPool();
        return length;
      },
    });

    return data ?? 0;
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
    const pool = await this.getPool();
    const storedUid = await this.findSelectedUid(date);
    const stored = storedUid
      ? pool.find(entry => entry.uid === storedUid)
      : undefined;
    if (stored) {
      return stored;
    }

    const picked = pickQuizEntry(pool, date);
    // プールは出題後も増えるので、選んだ映画を残さないと hash % length が
    // ずれて同じ日の答えが別の映画になる。過去日は当時の記録が無いので残さない
    if (!picked || date !== utcToday()) {
      return picked;
    }

    return (await this.persistSelection(date, picked.uid, storedUid)) ?? picked;
  }

  private async findSelectedUid(date: string): Promise<string | undefined> {
    const rows = await this.database
      .select({movieUid: quizSelections.movieUid})
      .from(quizSelections)
      .where(eq(quizSelections.quizDate, date))
      .limit(1);

    return rows[0]?.movieUid;
  }

  private async persistSelection(
    date: string,
    movieUid: string,
    staleUid: string | undefined,
  ): Promise<QuizPoolEntry | undefined> {
    if (staleUid === undefined) {
      await this.database
        .insert(quizSelections)
        .values({quizDate: date, movieUid})
        .onConflictDoNothing();
    } else {
      await this.database
        .update(quizSelections)
        .set({movieUid})
        .where(eq(quizSelections.quizDate, date));
      return undefined;
    }

    // 同時アクセスで別の行が先に入ることがあるので、勝った行に従う
    const winner = await this.findSelectedUid(date);
    if (winner === undefined || winner === movieUid) {
      return undefined;
    }

    const pool = await this.getPool();
    return pool.find(entry => entry.uid === winner);
  }
}
