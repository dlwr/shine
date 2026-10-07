import {describe, expect, it} from 'vitest';
import {
  buildQuizPosterHtml,
  cropLayout,
  QUIZ_POSTER_WIDTH,
  zoomForStage,
} from './quiz-poster';

describe('zoomForStage', () => {
  it('starts zoomed in', () => {
    expect(zoomForStage(0)).toBeGreaterThan(5);
  });

  it('zooms out as stages advance', () => {
    expect(zoomForStage(1)).toBeLessThan(zoomForStage(0));
  });

  it('still hides part of the poster on the last playable stage', () => {
    expect(zoomForStage(5)).toBeGreaterThan(1);
  });

  it('shows the whole poster once the game is over', () => {
    expect(zoomForStage(6)).toBe(1);
  });

  it('clamps stages beyond the last one', () => {
    expect(zoomForStage(99)).toBe(1);
  });
});

describe('cropLayout', () => {
  it('shows the whole poster at zoom 1', () => {
    const layout = cropLayout({zoom: 1, focalX: 0.5, focalY: 0.5});

    expect(layout).toMatchObject({left: 0, top: 0});
  });

  it('centers the focal point', () => {
    const layout = cropLayout({zoom: 2, focalX: 0.5, focalY: 0.5});

    expect(layout.left + layout.width * 0.5).toBe(QUIZ_POSTER_WIDTH / 2);
  });

  it('keeps the left edge inside the poster', () => {
    const layout = cropLayout({zoom: 4, focalX: 0, focalY: 0.5});

    expect(layout.left).toBe(0);
  });

  it('keeps the right edge inside the poster', () => {
    const layout = cropLayout({zoom: 4, focalX: 1, focalY: 0.5});

    expect(layout.left + layout.width).toBe(QUIZ_POSTER_WIDTH);
  });

  it('scales the enlarged poster to the given frame', () => {
    const layout = cropLayout({
      zoom: 3,
      focalX: 0.5,
      focalY: 0.5,
      frameWidth: 200,
      frameHeight: 300,
    });

    expect(layout).toMatchObject({width: 600, height: 900});
  });

  it('keeps the right edge inside the given frame', () => {
    const layout = cropLayout({
      zoom: 3,
      focalX: 1,
      focalY: 0.5,
      frameWidth: 200,
      frameHeight: 300,
    });

    expect(layout.left + layout.width).toBe(200);
  });
});

describe('buildQuizPosterHtml', () => {
  it('clips the enlarged poster to the frame', () => {
    const html = buildQuizPosterHtml({
      posterDataUri: 'data:image/jpeg;base64,AAA',
      stage: 0,
      focalX: 0.5,
      focalY: 0.5,
    });

    expect(html).toContain('overflow:hidden');
  });

  it('enlarges the poster beyond the frame', () => {
    const html = buildQuizPosterHtml({
      posterDataUri: 'data:image/jpeg;base64,AAA',
      stage: 0,
      focalX: 0.5,
      focalY: 0.5,
    });

    expect(html).toContain(`width="${QUIZ_POSTER_WIDTH * zoomForStage(0)}"`);
  });

  it('renders at the given frame size', () => {
    const html = buildQuizPosterHtml({
      posterDataUri: 'data:image/jpeg;base64,AAA',
      stage: 0,
      focalX: 0.5,
      focalY: 0.5,
      frameWidth: 336,
      frameHeight: 504,
    });

    expect(html).toContain('width:336px;height:504px');
  });
});
