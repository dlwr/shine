/**
 * OG画像(1200x630)のHTMLテンプレート。
 * workers-og(Satori)が解釈するため、すべてのdivに明示的なdisplay:flexが必要。
 * (子がテキスト1つでも省略するとレンダリングが失敗する)
 * 配色はサイトのライトテーマ(tokens.css)に固定する。
 */
import {buildQuizPosterHtml} from './quiz-poster';
import {SITE_NAME} from '@/lib/meta';

const COLORS = {
  paper: '#ece8df',
  surface: '#ffffff',
  ink: '#15140f',
  inkMuted: '#595650',
  brand: '#e01e10',
  brandOn: '#ffffff',
};

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const TAGLINE = '決められない日に、映画を1本';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function splitYear(
  year?: number,
): {head: string; tail: string} | undefined {
  if (!year) {
    return undefined;
  }

  const text = String(year).padStart(4, '0');
  return {head: text.slice(0, 2), tail: text.slice(2)};
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

type MovieCardProperties = {
  title: string;
  originalTitle?: string;
  year?: number;
  posterDataUri?: string;
  organizations: string[];
  availabilityLabels: string[];
};

function chip(label: string, isFilled: boolean): string {
  const style = isFilled
    ? `background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};`
    : `background:${COLORS.surface};color:${COLORS.ink};border:3px solid ${COLORS.ink};`;

  return `<div style="display:flex;${style}padding:6px 18px;font-size:26px;font-weight:700;">${escapeHtml(label)}</div>`;
}

export function buildMovieCardHtml({
  title,
  originalTitle,
  year,
  posterDataUri,
  organizations,
  availabilityLabels,
}: MovieCardProperties): string {
  const yearParts = splitYear(year);
  const showOriginal =
    originalTitle && originalTitle.trim() !== title.trim()
      ? originalTitle
      : undefined;

  const chips = [
    ...organizations.slice(0, 2).map(name => chip(name, true)),
    ...availabilityLabels.slice(0, 2).map(label => chip(label, false)),
  ].join('');

  const yearHtml = yearParts
    ? `<div style="display:flex;font-size:150px;font-weight:700;letter-spacing:-8px;line-height:0.8;color:${COLORS.ink};"><span>${yearParts.head}</span><span style="color:${COLORS.brand};">${yearParts.tail}</span></div>`
    : '';

  const originalHtml = showOriginal
    ? `<div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:16px;">${escapeHtml(showOriginal)}</div>`
    : '';

  const posterHtml = posterDataUri
    ? `<img src="${posterDataUri}" width="360" height="540" style="border:6px solid ${COLORS.ink};object-fit:cover;" />`
    : '';

  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:40px 48px;justify-content:space-between;align-items:center;">
  <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;flex:1;padding-right:40px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:5px solid ${COLORS.ink};padding-bottom:12px;">
      <div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.ink};">${SITE_NAME}</div>
      <div style="display:flex;font-size:22px;color:${COLORS.inkMuted};">${TAGLINE}</div>
    </div>
    <div style="display:flex;flex-direction:column;">
      ${yearHtml}
      <div style="display:flex;font-size:${titleFontSize(title)}px;font-weight:700;line-height:1.15;color:${COLORS.ink};margin-top:20px;">${escapeHtml(title)}</div>
      ${originalHtml}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;">${chips}</div>
  </div>
  ${posterHtml}
</div>`;
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

  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:40px 48px;justify-content:space-between;align-items:center;">
  <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;flex:1;padding-right:40px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:5px solid ${COLORS.ink};padding-bottom:12px;">
      <div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.ink};">${SITE_NAME}</div>
      <div style="display:flex;font-size:22px;color:${COLORS.inkMuted};">${TAGLINE}</div>
    </div>
    <div style="display:flex;flex-direction:column;">
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:6px;color:${COLORS.brand};">TODAY’S QUIZ</div>
      <div style="display:flex;font-size:76px;font-weight:700;letter-spacing:-4px;color:${COLORS.ink};margin-top:10px;">今日の映画クイズ</div>
      <div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:20px;">ポスターの一部と5つのヒントで当てる</div>
      <div style="display:flex;font-size:26px;color:${COLORS.inkMuted};margin-top:12px;">受賞作${poolSize.toLocaleString('ja-JP')}本から毎日1問 — ${escapeHtml(date)}</div>
    </div>
    <div style="display:flex;background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};padding:8px 22px;font-size:28px;font-weight:700;">shine-film.com/quiz</div>
  </div>
  ${cropHtml}
</div>`;
}

export const BANNER_WIDTH = 1500;
export const BANNER_HEIGHT = 500;

/** SNSプロフィール用バナー(3:1) */
export function buildBannerHtml(): string {
  return `<div style="display:flex;width:${BANNER_WIDTH}px;height:${BANNER_HEIGHT}px;background:${COLORS.paper};border:14px solid ${COLORS.ink};padding:40px 60px;align-items:center;justify-content:space-between;">
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;font-size:132px;font-weight:700;color:${COLORS.ink};line-height:1;">${SITE_NAME}</div>
    <div style="display:flex;font-size:38px;font-weight:700;color:${COLORS.ink};margin-top:24px;">${TAGLINE}</div>
  </div>
  <div style="display:flex;background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};padding:10px 26px;font-size:30px;font-weight:700;">shine-film.com</div>
</div>`;
}

export function buildHomeCardHtml(): string {
  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:60px;flex-direction:column;justify-content:space-between;">
  <div style="display:flex;font-size:168px;font-weight:700;color:${COLORS.ink};line-height:1;">${SITE_NAME}</div>
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;font-size:44px;font-weight:700;color:${COLORS.ink};">${TAGLINE}</div>
    <div style="display:flex;font-size:26px;color:${COLORS.inkMuted};margin-top:18px;">カンヌ・アカデミー賞・日本アカデミー賞などの受賞作から毎日・毎週・毎月1本。いま観られるかも一緒に。</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};padding:8px 22px;font-size:28px;font-weight:700;">shine-film.com</div>
  </div>
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
    .map(title => chip(title, true))
    .join('');

  const originalHtml = showOriginal
    ? `<div style="display:flex;font-size:30px;color:${COLORS.inkMuted};margin-top:16px;">${escapeHtml(showOriginal)}</div>`
    : '';

  const portraitHtml = portraitDataUri
    ? `<img src="${portraitDataUri}" width="360" height="540" style="border:6px solid ${COLORS.ink};object-fit:cover;" />`
    : '';

  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:40px 48px;justify-content:space-between;align-items:center;">
  <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;flex:1;padding-right:40px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:5px solid ${COLORS.ink};padding-bottom:12px;">
      <div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.ink};">${SITE_NAME}</div>
      <div style="display:flex;font-size:22px;color:${COLORS.inkMuted};">${TAGLINE}</div>
    </div>
    <div style="display:flex;flex-direction:column;">
      <div style="display:flex;align-items:flex-end;">
        <div style="display:flex;font-size:150px;font-weight:700;letter-spacing:-8px;line-height:0.8;color:${COLORS.brand};">${filmCount}</div>
        <div style="display:flex;font-size:34px;font-weight:700;letter-spacing:4px;color:${COLORS.ink};margin-left:14px;">FILMS</div>
      </div>
      <div style="display:flex;font-size:${titleFontSize(name)}px;font-weight:700;line-height:1.15;color:${COLORS.ink};margin-top:20px;">${escapeHtml(name)}</div>
      ${originalHtml}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;">${chips}</div>
  </div>
  ${portraitHtml}
</div>`;
}

const WATCHED_GRID_WIDTH = 440;
const WATCHED_GRID_HEIGHT = 520;
const WATCHED_GRID_GAP = 6;
const WATCHED_GRID_MIN_COLUMNS = 6;
const WATCHED_GRID_MAX_COLUMNS = 12;
const WATCHED_NAME_MAX_FONT_SIZE = 48;

export function watchedGridLayout(total: number): {
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
        ? `background:${COLORS.brand};border:2px solid ${COLORS.ink};`
        : `background:${COLORS.surface};border:2px solid ${COLORS.ink};`;
      return `<div data-cell="${watched ? 'watched' : 'unwatched'}" style="display:flex;width:${cellSize}px;height:${cellSize}px;${fill}"></div>`;
    })
    .join('');

  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:40px 48px;justify-content:space-between;align-items:center;">
  <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;flex:1;padding-right:40px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:5px solid ${COLORS.ink};padding-bottom:12px;">
      <div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.ink};">${SITE_NAME}</div>
      <div style="display:flex;font-size:22px;color:${COLORS.inkMuted};">${TAGLINE}</div>
    </div>
    <div style="display:flex;flex-direction:column;">
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:6px;color:${COLORS.brand};">WATCHED</div>
      ${organizationHtml}
      <div style="display:flex;font-size:${Math.min(titleFontSize(name), WATCHED_NAME_MAX_FONT_SIZE)}px;font-weight:700;line-height:1.15;color:${COLORS.ink};margin-top:6px;">${escapeHtml(name)}</div>
      <div style="display:flex;align-items:flex-end;margin-top:24px;">
        <div style="display:flex;font-size:150px;font-weight:700;letter-spacing:-8px;line-height:0.8;color:${COLORS.brand};">${count}</div>
        <div style="display:flex;font-size:44px;font-weight:700;color:${COLORS.ink};margin-left:16px;">/ ${total}</div>
        <div style="display:flex;font-size:34px;font-weight:700;color:${COLORS.inkMuted};margin-left:24px;">${percent}%</div>
      </div>
    </div>
    <div style="display:flex;background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};padding:8px 22px;font-size:28px;font-weight:700;">shine-film.com/watched</div>
  </div>
  <div style="display:flex;flex-wrap:wrap;width:${gridWidth}px;gap:${WATCHED_GRID_GAP}px;align-content:flex-start;">${cells}</div>
</div>`;
}
