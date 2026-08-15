/**
 * クイズ用のポスター切り出し。
 * Satoriはfilterを解さないため、拡大した画像をoverflow:hiddenの枠に絶対配置してクロップする。
 */
export const QUIZ_POSTER_WIDTH = 480;
export const QUIZ_POSTER_HEIGHT = 720;

/** 手数ぶんの6段階と、決着後に全体を見せる最終段階 */
const ZOOM_STAGES = [6, 4.5, 3.2, 2.4, 1.8, 1.4, 1];

const COLORS = {
  paper: '#ece8df',
  ink: '#15140f',
};

export function zoomForStage(stage: number): number {
  const index = Math.min(
    Math.max(Math.trunc(stage), 0),
    ZOOM_STAGES.length - 1,
  );
  return ZOOM_STAGES[index];
}

export type CropLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function cropLayout({
  zoom,
  focalX,
  focalY,
}: {
  zoom: number;
  focalX: number;
  focalY: number;
}): CropLayout {
  const width = Math.round(QUIZ_POSTER_WIDTH * zoom);
  const height = Math.round(QUIZ_POSTER_HEIGHT * zoom);

  return {
    width,
    height,
    left: Math.round(
      clamp(
        QUIZ_POSTER_WIDTH / 2 - focalX * width,
        QUIZ_POSTER_WIDTH - width,
        0,
      ),
    ),
    top: Math.round(
      clamp(
        QUIZ_POSTER_HEIGHT / 2 - focalY * height,
        QUIZ_POSTER_HEIGHT - height,
        0,
      ),
    ),
  };
}

export function buildQuizPosterHtml({
  posterDataUri,
  stage,
  focalX,
  focalY,
}: {
  posterDataUri: string;
  stage: number;
  focalX: number;
  focalY: number;
}): string {
  const layout = cropLayout({zoom: zoomForStage(stage), focalX, focalY});

  return `<div style="display:flex;position:relative;width:${QUIZ_POSTER_WIDTH}px;height:${QUIZ_POSTER_HEIGHT}px;overflow:hidden;background:${COLORS.paper};border:8px solid ${COLORS.ink};">
  <img src="${posterDataUri}" width="${layout.width}" height="${layout.height}" style="position:absolute;left:${layout.left}px;top:${layout.top}px;" />
</div>`;
}
