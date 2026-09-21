import {eq, type Environment} from '@shine/database';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {quizSelections} from '@shine/database/schema/quiz-selections';
import {beforeEach, describe, expect, it} from 'vitest';
import {QuizService} from '../quiz-service';
import {addToPool, createEnvironment, type Database} from './quiz-pool-fixture';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function storedUid(
  database: Database,
  date: string,
): Promise<string | undefined> {
  const rows = await database
    .select({movieUid: quizSelections.movieUid})
    .from(quizSelections)
    .where(eq(quizSelections.quizDate, date))
    .limit(1);

  return rows[0]?.movieUid;
}

describe('出題の永続化', () => {
  let environment: Environment;
  let database: Database;

  beforeEach(async () => {
    ({environment, database} = await createEnvironment(12));
  });

  it('プールに映画が増えても同じ日の答えは変わらない', async () => {
    const date = todayUtc();
    const before = await new QuizService(environment).getEntry(date);

    await addToPool(database, ['movie-new']);
    const after = await new QuizService(environment).getEntry(date);

    expect(after?.uid).toBe(before?.uid);
  });

  it('初回の取得で選んだ映画を保存する', async () => {
    const date = todayUtc();
    const entry = await new QuizService(environment).getEntry(date);

    expect(await storedUid(database, date)).toBe(entry?.uid);
  });

  it('過去の日付は保存しない', async () => {
    await new QuizService(environment).getEntry('2020-01-01');

    expect(await storedUid(database, '2020-01-01')).toBeUndefined();
  });

  it('保存済みの映画がプールから消えたら選び直す', async () => {
    const date = todayUtc();
    const entry = await new QuizService(environment).getEntry(date);
    await database
      .delete(posterUrls)
      .where(eq(posterUrls.movieUid, entry!.uid));

    const after = await new QuizService(environment).getEntry(date);

    expect(after?.uid).not.toBe(entry?.uid);
  });
});
