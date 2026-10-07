/**
 * OG画像(1200x630)のHTMLテンプレート。
 * workers-og(Satori)が解釈するため、すべてのdivに明示的なdisplay:flexが必要。
 * (子がテキスト1つでも省略するとレンダリングが失敗する)
 * 配色はサイトの暗いテーマ(tokens.css の .dark)に固定する。
 */
import {buildQuizPosterHtml} from './quiz-poster';
import {TAGLINE} from '@/lib/tagline';

const COLORS = {
  paper: '#211a1e',
  surface: '#2c2327',
  ink: '#efe7dc',
  inkMuted: '#b9ab9f',
  rule: '#6b5a5f',
  brand: '#ff6a58',
};

export const OG_FONT_FAMILY = 'Noto Serif JP';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function titleFontSize(title: string): number {
  if (title.length <= 12) {
    return 72;
  }

  if (title.length <= 20) {
    return 56;
  }

  if (title.length <= 32) {
    return 44;
  }

  return 36;
}

function wordmark(fontSize: number, gap: number): string {
  const letters = [...'SHINE']
    .map(letter => `<div style="display:flex;">${letter}</div>`)
    .join('');

  return `<div data-wordmark="SHINE" style="display:flex;gap:${gap}px;font-size:${fontSize}px;font-weight:700;line-height:1;color:${COLORS.ink};">${letters}</div>`;
}

function doubleRule(): string {
  return `<div style="display:flex;flex-direction:column;margin-top:14px;"><div style="display:flex;height:2px;background:${COLORS.rule};"></div><div style="display:flex;height:2px;background:${COLORS.rule};margin-top:4px;"></div></div>`;
}

function cardHeader(): string {
  return `<div style="display:flex;flex-direction:column;">
      <div style="display:flex;align-items:flex-end;">
        ${wordmark(44, 10)}
        <div style="display:flex;margin-left:auto;font-size:22px;color:${COLORS.inkMuted};">${TAGLINE}</div>
      </div>
      ${doubleRule()}
    </div>`;
}

function stamp(label: string, fontSize = 26): string {
  return `<div style="display:flex;border:3px solid ${COLORS.brand};color:${COLORS.brand};padding:6px 16px;font-size:${fontSize}px;font-weight:700;">${escapeHtml(label)}</div>`;
}

function tag(label: string): string {
  return `<div style="display:flex;border:2px solid ${COLORS.rule};color:${COLORS.inkMuted};padding:6px 16px;font-size:24px;font-weight:700;">${escapeHtml(label)}</div>`;
}

function siteAddress(path = ''): string {
  return `<div style="display:flex;font-size:26px;color:${COLORS.inkMuted};">shine-film.com${path}</div>`;
}

function cardFrame(body: string, aside: string): string {
  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};padding:48px 56px;justify-content:space-between;align-items:center;">
  <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;flex:1;padding-right:48px;">
    ${cardHeader()}
    ${body}
  </div>
  ${aside}
</div>`;
}

function framedImage(dataUri: string | undefined): string {
  return dataUri
    ? `<img src="${dataUri}" width="360" height="534" style="border:2px solid ${COLORS.rule};object-fit:cover;" />`
    : '';
}

type MovieCardProperties = {
  title: string;
  originalTitle?: string;
  year?: number;
  posterDataUri?: string;
  organizations: string[];
  availabilityLabels: string[];
};

export function buildMovieCardHtml({
  title,
  originalTitle,
  year,
  posterDataUri,
  organizations,
  availabilityLabels,
}: MovieCardProperties): string {
  const showOriginal =
    originalTitle && originalTitle.trim() !== title.trim()
      ? originalTitle
      : undefined;

  const chips = [
    ...organizations.slice(0, 2).map(name => stamp(name)),
    ...availabilityLabels.slice(0, 2).map(label => tag(label)),
  ].join('');

  const yearHtml = year
    ? `<div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.inkMuted};">${year}</div>`
    : '';

  const originalHtml = showOriginal
    ? `<div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:16px;">${escapeHtml(showOriginal)}</div>`
    : '';

  return cardFrame(
    `<div style="display:flex;flex-direction:column;">
      ${yearHtml}
      <div style="display:flex;font-size:${titleFontSize(title)}px;font-weight:700;line-height:1.25;color:${COLORS.ink};margin-top:12px;">${escapeHtml(title)}</div>
      ${originalHtml}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;">${chips}</div>`,
    framedImage(posterDataUri),
  );
}

const QUIZ_CARD_FRAME_WIDTH = 324;
const QUIZ_CARD_FRAME_HEIGHT = 486;

type QuizCardProperties = {
  date: string;
  poolSize: number;
  posterDataUri?: string;
  focalX?: number;
  focalY?: number;
};

export function buildQuizCardHtml({
  date,
  poolSize,
  posterDataUri,
  focalX = 0.5,
  focalY = 0.5,
}: QuizCardProperties): string {
  const cropHtml = posterDataUri
    ? buildQuizPosterHtml({
        posterDataUri,
        stage: 0,
        focalX,
        focalY,
        frameWidth: QUIZ_CARD_FRAME_WIDTH,
        frameHeight: QUIZ_CARD_FRAME_HEIGHT,
      })
    : '';

  return cardFrame(
    `<div style="display:flex;flex-direction:column;">
      <div style="display:flex;font-size:28px;color:${COLORS.inkMuted};">${escapeHtml(date)}</div>
      <div style="display:flex;font-size:76px;font-weight:700;color:${COLORS.ink};margin-top:10px;">今日の映画クイズ</div>
      <div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:20px;">ポスターの一部と5つのヒントで当てる</div>
      <div style="display:flex;font-size:26px;color:${COLORS.inkMuted};margin-top:12px;">受賞作${poolSize.toLocaleString('ja-JP')}本から毎日1問</div>
    </div>
    ${siteAddress('/quiz')}`,
    cropHtml,
  );
}

export const BANNER_WIDTH = 1500;
export const BANNER_HEIGHT = 500;

/** SNSプロフィール用バナー(3:1) */
export function buildBannerHtml(): string {
  return `<div style="display:flex;width:${BANNER_WIDTH}px;height:${BANNER_HEIGHT}px;background:${COLORS.paper};padding:60px 80px;align-items:center;">
  <div style="display:flex;flex-direction:column;">
    ${wordmark(140, 36)}
    ${doubleRule()}
    <div style="display:flex;font-size:40px;font-weight:700;color:${COLORS.ink};margin-top:28px;">${TAGLINE}</div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;height:100%;margin-left:auto;">
    <div style="display:flex;transform:rotate(-6deg);">${stamp('今月の1本', 40)}</div>
    ${siteAddress()}
  </div>
</div>`;
}

export function buildHomeCardHtml(): string {
  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};padding:64px;flex-direction:column;justify-content:space-between;">
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;align-items:flex-start;">
      ${wordmark(160, 40)}
      <div style="display:flex;transform:rotate(-6deg);margin-top:24px;margin-left:auto;">${stamp('今月の1本', 40)}</div>
    </div>
    ${doubleRule()}
  </div>
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.ink};">${TAGLINE}</div>
    <div style="display:flex;font-size:26px;line-height:1.6;color:${COLORS.inkMuted};margin-top:18px;">カンヌ・アカデミー賞・日本アカデミー賞などの受賞作から今月の1本。日替わり・週替わりの1本と、いま観られるかも一緒に。</div>
  </div>
  ${siteAddress()}
</div>`;
}

type PersonCardProperties = {
  name: string;
  originalName?: string;
  filmCount: number;
  topTitles: string[];
  portraitDataUri?: string;
};

export function buildPersonCardHtml({
  name,
  originalName,
  filmCount,
  topTitles,
  portraitDataUri,
}: PersonCardProperties): string {
  const showOriginal =
    originalName && originalName.trim() !== name.trim()
      ? originalName
      : undefined;

  const chips = topTitles
    .slice(0, 2)
    .map(title => tag(title))
    .join('');

  const originalHtml = showOriginal
    ? `<div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:16px;">${escapeHtml(showOriginal)}</div>`
    : '';

  return cardFrame(
    `<div style="display:flex;flex-direction:column;">
      <div style="display:flex;font-size:34px;font-weight:700;color:${COLORS.inkMuted};">出演・監督 ${filmCount} 本</div>
      <div style="display:flex;font-size:${titleFontSize(name)}px;font-weight:700;line-height:1.25;color:${COLORS.ink};margin-top:16px;">${escapeHtml(name)}</div>
      ${originalHtml}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;">${chips}</div>`,
    framedImage(portraitDataUri),
  );
}

const WATCHED_GRID_WIDTH = 440;
const WATCHED_GRID_HEIGHT = 520;
const WATCHED_GRID_GAP = 6;
const WATCHED_GRID_MIN_COLUMNS = 6;
const WATCHED_GRID_MAX_COLUMNS = 12;
const WATCHED_NAME_MAX_FONT_SIZE = 48;

function watchedGridLayout(total: number): {
  columns: number;
  cellSize: number;
} {
  const columns = Math.min(
    WATCHED_GRID_MAX_COLUMNS,
    Math.max(WATCHED_GRID_MIN_COLUMNS, Math.ceil(Math.sqrt(total))),
  );
  const rows = Math.max(1, Math.ceil(total / columns));
  const byWidth = Math.floor(
    (WATCHED_GRID_WIDTH - WATCHED_GRID_GAP * (columns - 1)) / columns,
  );
  const byHeight = Math.floor(
    (WATCHED_GRID_HEIGHT - WATCHED_GRID_GAP * (rows - 1)) / rows,
  );

  return {columns, cellSize: Math.min(byWidth, byHeight)};
}

type WatchedCardProperties = {
  organization: string;
  name: string;
  total: number;
  count: number;
  percent: number;
  /** 授賞式年の昇順に並べた1本ごとの観たかどうか */
  watchedFlags: boolean[];
};

export function buildWatchedCardHtml({
  organization,
  name,
  total,
  count,
  percent,
  watchedFlags,
}: WatchedCardProperties): string {
  const {columns, cellSize} = watchedGridLayout(total);
  const organizationHtml =
    organization.trim() === name.trim()
      ? ''
      : `<div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:12px;">${escapeHtml(organization)}</div>`;
  const gridWidth = columns * cellSize + WATCHED_GRID_GAP * (columns - 1);
  const cells = watchedFlags
    .map(watched => {
      const fill = watched
        ? `background:${COLORS.brand};border:2px solid ${COLORS.brand};`
        : `background:${COLORS.surface};border:2px solid ${COLORS.rule};`;
      return `<div data-cell="${watched ? 'watched' : 'unwatched'}" style="display:flex;width:${cellSize}px;height:${cellSize}px;${fill}"></div>`;
    })
    .join('');

  return cardFrame(
    `<div style="display:flex;flex-direction:column;">
      <div style="display:flex;font-size:28px;font-weight:700;color:${COLORS.inkMuted};">観た映画チェック</div>
      ${organizationHtml}
      <div style="display:flex;font-size:${Math.min(titleFontSize(name), WATCHED_NAME_MAX_FONT_SIZE)}px;font-weight:700;line-height:1.25;color:${COLORS.ink};margin-top:6px;">${escapeHtml(name)}</div>
      <div style="display:flex;align-items:flex-end;margin-top:24px;">
        <div style="display:flex;font-size:120px;font-weight:700;line-height:1;color:${COLORS.ink};">${count}</div>
        <div style="display:flex;font-size:44px;font-weight:700;color:${COLORS.ink};margin-left:16px;">/ ${total}</div>
        <div style="display:flex;font-size:34px;font-weight:700;color:${COLORS.inkMuted};margin-left:24px;">${percent}%</div>
      </div>
    </div>
    ${siteAddress('/watched')}`,
    `<div style="display:flex;flex-wrap:wrap;width:${gridWidth}px;gap:${WATCHED_GRID_GAP}px;align-content:flex-start;">${cells}</div>`,
  );
}
