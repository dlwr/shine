const MAX_ORGANIZATIONS = 2;
const MAX_POST_LENGTH = 300;
const HASHTAG = '#青空映画部';
const X_MAX_WEIGHTED_LENGTH = 280;
const X_URL_WEIGHT = 23;

type DailyPostInput = {
  title: string;
  year?: number;
  organizations: string[];
  availabilityLabels: string[];
};

function buildBodyLines({
  title,
  year,
  organizations,
  availabilityLabels,
}: DailyPostInput): string {
  const yearPart = year ? `(${year})` : '';
  const lines = [`今日の1本 —『${title}』${yearPart}`];

  if (organizations.length > 0) {
    lines.push(`${organizations.slice(0, MAX_ORGANIZATIONS).join('・')} 選出`);
  }

  if (availabilityLabels.length > 0) {
    lines.push(`▶ ${availabilityLabels.join(' / ')}`);
  }

  return lines.join('\n');
}

function withHashtag(body: string): string {
  const maxBodyLength = MAX_POST_LENGTH - [...`\n${HASHTAG}`].length;
  const truncatedBody =
    [...body].length <= maxBodyLength
      ? body
      : [...body].slice(0, maxBodyLength - 1).join('') + '…';

  return `${truncatedBody}\n${HASHTAG}`;
}

export function buildDailyPostText(input: DailyPostInput): string {
  return withHashtag(buildBodyLines(input));
}

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
  return `${buildQuizBody(input)}\n${input.url.replace(/^https?:\/\//, '')}`;
}

export function xWeightedLength(text: string): number {
  let length = 0;
  for (const character of text) {
    length += character.codePointAt(0)! < 0x11_00 ? 1 : 2;
  }

  return length;
}

function withBareUrl(body: string, url: string): string {
  const bareUrl = url.replace(/^https?:\/\//, '');
  const urlWeight = Math.max(X_URL_WEIGHT, xWeightedLength(bareUrl));
  const maxBodyWeight = X_MAX_WEIGHTED_LENGTH - urlWeight - 1;

  let truncatedBody = body;
  if (xWeightedLength(body) > maxBodyWeight) {
    const characters = [...body];
    let weight = 2;
    let endIndex = 0;
    for (const [index, character] of characters.entries()) {
      const characterWeight = character.codePointAt(0)! < 0x11_00 ? 1 : 2;
      if (weight + characterWeight > maxBodyWeight) {
        break;
      }

      weight += characterWeight;
      endIndex = index + 1;
    }

    truncatedBody = characters.slice(0, endIndex).join('') + '…';
  }

  return `${truncatedBody}\n${bareUrl}`;
}

export function buildXPostText(input: DailyPostInput & {url: string}): string {
  return withBareUrl(buildBodyLines(input), input.url);
}

type WatchedPostInput = {
  heading: string;
  total: number;
};

function buildWatchedBody({heading, total}: WatchedPostInput): string {
  return [
    '今週の観た映画チェック',
    `${heading}の歴代受賞作${total}本、何本観た？`,
    'チェックを付けて結果を共有できます。',
  ].join('\n');
}

export function buildWatchedPostText(input: WatchedPostInput): string {
  return `${buildWatchedBody(input)}\n${HASHTAG}`;
}

export function buildWatchedXPostText(
  input: WatchedPostInput & {url: string},
): string {
  return `${buildWatchedBody(input)}\n${input.url.replace(/^https?:\/\//, '')}`;
}

type PersonPostInput = {
  name: string;
  role: 'director' | 'actor';
  wonCount: number;
  nominatedCount: number;
  topMovies: Array<{title: string; year?: number}>;
};

const ROLE_LABELS = {director: '監督', actor: '俳優'} as const;

function buildPersonBody({
  name,
  role,
  wonCount,
  nominatedCount,
  topMovies,
}: PersonPostInput): string {
  const lines = [
    `今週の映画人 — ${name}（${ROLE_LABELS[role]}）`,
    `監督賞・演技賞で${wonCount}回受賞 / ${nominatedCount}回ノミネート`,
  ];

  if (topMovies.length > 0) {
    const titles = topMovies.map(
      movie => `『${movie.title}』${movie.year ? `(${movie.year})` : ''}`,
    );
    lines.push(`代表作: ${titles.join('・')}`);
  }

  return lines.join('\n');
}

export function buildPersonPostText(input: PersonPostInput): string {
  return withHashtag(buildPersonBody(input));
}

export function buildPersonXPostText(
  input: PersonPostInput & {url: string},
): string {
  return withBareUrl(buildPersonBody(input), input.url);
}
