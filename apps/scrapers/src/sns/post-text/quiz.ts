import {HASHTAG, bareUrl} from './framing';

type QuizPostInput = {
  date: string;
  poolSize: number;
};

function buildQuizBody({date, poolSize}: QuizPostInput): string {
  const [, month, day] = date.split('-', 3);

  return [
    `今日の映画クイズ（${Number(month)}/${Number(day)}）`,
    'ポスターの一部と5つのヒントから、今日の1本を当てる。',
    `受賞作${poolSize.toLocaleString('en-US')}本から毎日1問。`,
  ].join('\n');
}

export function buildQuizPostText(input: QuizPostInput): string {
  return `${buildQuizBody(input)}\n${HASHTAG}`;
}

export function buildQuizShareUrl({
  siteUrl,
  date,
}: {
  siteUrl: string;
  date: string;
}): string {
  return `${siteUrl}/quiz?d=${date}`;
}

export function buildQuizXPostText(
  input: QuizPostInput & {url: string},
): string {
  return `${buildQuizBody(input)}\n${bareUrl(input.url)}`;
}
