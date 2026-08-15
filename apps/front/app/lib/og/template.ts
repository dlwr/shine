/**
 * OG画像(1200x630)のHTMLテンプレート。
 * workers-og(Satori)が解釈するため、すべてのdivに明示的なdisplay:flexが必要。
 * (子がテキスト1つでも省略するとレンダリングが失敗する)
 * 配色はサイトのライトテーマ(tokens.css)に固定する。
 */
import {buildQuizPosterHtml} from './quiz-poster';

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

const TAGLINE = '毎日1本、埋もれた映画に光を当てる';

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

function chip(label: string, filled: boolean): string {
  const style = filled
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
      <div style="display:flex;font-size:54px;font-weight:700;letter-spacing:-3px;color:${COLORS.ink};">SHINE</div>
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
};

export function buildQuizCardHtml({
  date,
  poolSize,
  posterDataUri,
}: QuizCardProperties): string {
  const cropHtml = posterDataUri
    ? buildQuizPosterHtml({
        posterDataUri,
        stage: 0,
        focalX: 0.5,
        focalY: 0.5,
        frameWidth: QUIZ_CARD_FRAME_WIDTH,
        frameHeight: QUIZ_CARD_FRAME_HEIGHT,
      })
    : '';

  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:40px 48px;justify-content:space-between;align-items:center;">
  <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;flex:1;padding-right:40px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:5px solid ${COLORS.ink};padding-bottom:12px;">
      <div style="display:flex;font-size:54px;font-weight:700;letter-spacing:-3px;color:${COLORS.ink};">SHINE</div>
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
    <div style="display:flex;font-size:150px;font-weight:700;letter-spacing:-9px;color:${COLORS.ink};line-height:0.9;">SHINE</div>
    <div style="display:flex;font-size:38px;font-weight:700;color:${COLORS.ink};margin-top:24px;">${TAGLINE}</div>
  </div>
  <div style="display:flex;background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};padding:10px 26px;font-size:30px;font-weight:700;">shine-film.com</div>
</div>`;
}

export function buildHomeCardHtml(): string {
  return `<div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:${COLORS.paper};border:16px solid ${COLORS.ink};padding:60px;flex-direction:column;justify-content:space-between;">
  <div style="display:flex;font-size:200px;font-weight:700;letter-spacing:-12px;color:${COLORS.ink};line-height:0.9;">SHINE</div>
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;font-size:44px;font-weight:700;color:${COLORS.ink};">${TAGLINE}</div>
    <div style="display:flex;font-size:26px;color:${COLORS.inkMuted};margin-top:18px;">カンヌ・アカデミー賞・日本アカデミー賞などの受賞作から毎日・毎週・毎月1本。いま観られるかも一緒に。</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;background:${COLORS.brand};color:${COLORS.brandOn};border:3px solid ${COLORS.ink};padding:8px 22px;font-size:28px;font-weight:700;">shine-film.com</div>
  </div>
</div>`;
}
