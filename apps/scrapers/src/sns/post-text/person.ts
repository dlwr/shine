import {formatTitle, withBareUrl, withHashtag} from './framing';

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
    const titles = topMovies.map(movie => formatTitle(movie.title, movie.year));
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
