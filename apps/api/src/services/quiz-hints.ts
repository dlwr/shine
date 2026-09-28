import type {QuizAnswer, QuizHint} from '../types/quiz';
import {simpleHash} from '../utils/hash';
import type {QuizPoolEntry} from './quiz-pool-query';

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
function quizFocalPoint(date: string): {focalX: number; focalY: number} {
  const seed = simpleHash(`quiz-focal-${date}`);

  return {
    focalX: 0.3 + ((seed % 1000) / 1000) * 0.4,
    focalY: 0.25 + (((seed >>> 10) % 1000) / 1000) * 0.35,
  };
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
