import { describe, expect, it } from 'vitest';
import type { PlacedNode } from '../model';
import {
  MAX_ZOOM, ZOOM_STEP, centreOn, fitView, fullPictureNodes, labelsVisible, nextNodeInDirection,
  panBy, visibleNodes, zoomAt, zoomFactor,
} from '../zoomPan';

const viewport = { width: 800, height: 600 };

describe('fitView', () => {
  it('scales the drawing to the viewport and centres it', () => {
    const view = fitView({ width: 4000, height: 1000 }, viewport, 0);
    expect(view.k).toBe(0.2);
    expect(view.x).toBe(0);
    expect(view.y).toBe(200);
  });

  it('does not blow a small drawing up past the zoom limit', () => {
    expect(fitView({ width: 10, height: 10 }, viewport).k).toBe(MAX_ZOOM);
  });

  it('fits a drawing many times the canvas whole', () => {
    const view = fitView({ width: 20000, height: 600 }, viewport, 0);
    expect(20000 * view.k + view.x).toBeLessThanOrEqual(viewport.width);
    expect(view.x).toBeGreaterThanOrEqual(0);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor where it is', () => {
    const before = { x: 100, y: 50, k: 1 };
    const after = zoomAt(before, 2, 300, 250);
    // the drawing point under (300, 250) was (200, 200); at k=2 it must still map there
    expect(200 * after.k + after.x).toBe(300);
    expect(200 * after.k + after.y).toBe(250);
  });

  it('clamps to the limits', () => {
    expect(zoomAt({ x: 0, y: 0, k: 3 }, 10, 0, 0).k).toBe(MAX_ZOOM);
  });
});

describe('panBy and centreOn', () => {
  it('moves the view without touching the scale', () => {
    expect(panBy({ x: 1, y: 2, k: 0.5 }, 10, -5)).toEqual({ x: 11, y: -3, k: 0.5 });
  });

  it('puts the point in the middle of the viewport', () => {
    const view = centreOn({ x: 0, y: 0, k: 2 }, { x: 100, y: 100 }, viewport);
    expect(100 * view.k + view.x).toBe(400);
    expect(100 * view.k + view.y).toBe(300);
  });
});

describe('visibleNodes', () => {
  const node = (id: string, x: number, y: number): PlacedNode => ({
    id, baseId: id, kind: 'cargo', notes: [], width: 100, height: 50, x, y,
  });
  const nodes = [node('in', 10, 10), node('edge', 750, 580), node('out', 2000, 2000)];

  it('lists the nodes whose box touches the viewport', () => {
    expect(visibleNodes(nodes, { x: 0, y: 0, k: 1 }, viewport)).toEqual(new Set(['in', 'edge']));
  });

  it('follows the view', () => {
    expect(visibleNodes(nodes, { x: -1950, y: -1950, k: 1 }, viewport)).toEqual(new Set(['out']));
    expect(visibleNodes(nodes, { x: 0, y: 0, k: 0.25 }, viewport)).toEqual(new Set(['in', 'edge', 'out']));
  });

  it('hands out full pictures only above 1:1, and only in view', () => {
    expect(fullPictureNodes(nodes, { x: 0, y: 0, k: 1 }, viewport)).toBeNull();
    expect(fullPictureNodes(nodes, { x: 0, y: 0, k: 0.5 }, viewport)).toBeNull();
    // at 1.5× the node at (750, 580) lands past the 800×600 viewport
    expect(fullPictureNodes(nodes, { x: 0, y: 0, k: 1.5 }, viewport)).toEqual(new Set(['in']));
  });
});

describe('zoomFactor', () => {
  it('turns one mouse notch into one step of the buttons', () => {
    expect(zoomFactor(-100, 0, 600)).toBeCloseTo(ZOOM_STEP, 5);
    expect(zoomFactor(100, 0, 600)).toBeCloseTo(1 / ZOOM_STEP, 5);
  });

  it('gives a trackpad nudge a nudge of zoom, not a whole step', () => {
    const nudge = zoomFactor(-5, 0, 600);
    expect(nudge).toBeGreaterThan(1);
    expect(nudge).toBeLessThan(1.02);
  });

  it('adds up the same however the travel is split', () => {
    const whole = zoomFactor(-100, 0, 600);
    const inTwenty = Array.from({ length: 20 }, () => zoomFactor(-5, 0, 600)).reduce((a, b) => a * b, 1);
    expect(inTwenty).toBeCloseTo(whole, 5);
  });

  it('reads lines and pages as the pixels they stand for', () => {
    expect(zoomFactor(-100 / 16, 1, 600)).toBeCloseTo(ZOOM_STEP, 5);
    expect(zoomFactor(-100 / 600, 2, 600)).toBeCloseTo(ZOOM_STEP, 5);
  });
});

describe('labelsVisible', () => {
  it('drops the text on the overview and brings it back on the way in', () => {
    expect(labelsVisible(0.3)).toBe(false);
    expect(labelsVisible(0.5)).toBe(true);
    expect(labelsVisible(1)).toBe(true);
  });
});

describe('nextNodeInDirection', () => {
  const at = (id: string, x: number, y: number): PlacedNode => ({
    id, baseId: id, kind: 'cargo', notes: [], width: 100, height: 50, x, y,
  });
  //  a — b — c   (b between a and c, d below b, far away to the right: e)
  const nodes = [at('a', 0, 0), at('b', 300, 0), at('c', 600, 0), at('d', 300, 400), at('e', 5000, 0)];

  it('goes to the nearest node in the quadrant of the arrow', () => {
    expect(nextNodeInDirection(nodes, 'a', 'right')).toBe('b');
    expect(nextNodeInDirection(nodes, 'b', 'right')).toBe('c');
    expect(nextNodeInDirection(nodes, 'c', 'left')).toBe('b');
    expect(nextNodeInDirection(nodes, 'b', 'down')).toBe('d');
    expect(nextNodeInDirection(nodes, 'd', 'up')).toBe('b');
  });

  it('stays put when the quadrant is empty', () => {
    expect(nextNodeInDirection(nodes, 'a', 'up')).toBe('a');
    expect(nextNodeInDirection(nodes, 'e', 'right')).toBe('e');
  });

  it('starts at the first node when there is no cursor yet', () => {
    expect(nextNodeInDirection(nodes, null, 'right')).toBe('a');
    expect(nextNodeInDirection([], null, 'right')).toBeNull();
  });
});
