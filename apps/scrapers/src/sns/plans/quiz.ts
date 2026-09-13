import {fetchQuizPuzzle} from '../api-client';
import {type PostPlan} from '../post-plan';
import {
  buildQuizPostText,
  buildQuizShareUrl,
  buildQuizXPostText,
} from '../post-text';
import {SITE_URL} from '../site';

export async function buildQuizPlan(): Promise<PostPlan> {
  // 出題日はAPIに従う(ジョブの起動が遅れても昨日の問題を告知しない)
  const puzzle = await fetchQuizPuzzle();
  const url = buildQuizShareUrl({siteUrl: SITE_URL, date: puzzle.date});

  return {
    text: buildQuizPostText(puzzle),
    xText: buildQuizXPostText({...puzzle, url}),
    link: {
      uri: url,
      title: '今日の映画クイズ | SHINE',
      description:
        'ポスターの一部と5つのヒントから、今日の1本を当てる。毎日1問。',
    },
    imageUrl: `${SITE_URL}/og/quiz.png?date=${puzzle.date}`,
  };
}
