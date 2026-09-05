/**
 * The view of the canvas: where the drawing's origin sits in the viewport and at what
 * scale. Pure functions on the view, so the arithmetic of "zoom around the cursor" and
 * "fit the drawing" is tested without a browser; the hook beside them wires the events.
 */
import type { PlacedNode } from './model';

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Far enough out for a drawing many times the canvas to fit whole. */
const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;
/** One press of a toolbar button, and one notch of a mouse wheel. */
export const ZOOM_STEP = 1.25;
/** Below this scale a node is its picture or its colour, and carries no text. */
export const LABELS_FROM = 0.5;
/**
 * How much one pixel of scrolling zooms. A mouse notch reports about 100 pixels and is
 * meant to feel like a button press, so the whole notch is one ZOOM_STEP; a trackpad
 * reports a few pixels per frame and gets a few percent, instead of a full step per event.
 */
const PER_PIXEL = Math.log(ZOOM_STEP) / 100;
/** A line of scrolling in pixels, for pointers that report lines rather than pixels. */
const LINE_HEIGHT = 16;

/** Are node labels drawn at this scale? */
export const labelsVisible = (k: number) => k >= LABELS_FROM;

/**
 * The zoom a wheel gesture asks for: exponential in how far it scrolled, so the same travel
 * gives the same zoom whether it arrives as one large event or forty small ones.
 * `deltaMode` follows the WheelEvent constants: 0 pixels, 1 lines, 2 pages.
 */
export function zoomFactor(deltaY: number, deltaMode: number, viewportHeight: number): number {
  const perUnit = deltaMode === 1 ? LINE_HEIGHT : deltaMode === 2 ? viewportHeight : 1;
  return Math.exp(-deltaY * perUnit * PER_PIXEL);
}

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** The whole drawing in view, centred, with a margin around it. */
export function fitView(content: Size, viewport: Size, padding = 16): View {
  const k = clampZoom(
    Math.min(
      (viewport.width - 2 * padding) / content.width,
      (viewport.height - 2 * padding) / content.height,
    ),
  );
  return {
    k,
    x: (viewport.width - content.width * k) / 2,
    y: (viewport.height - content.height * k) / 2,
  };
}

/** Scale by `factor` keeping the viewport point (px, py) over the same spot of the drawing. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const k = clampZoom(view.k * factor);
  const f = k / view.k;
  return { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** The view that puts a point of the drawing in the middle of the viewport, at the same scale. */
export function centreOn(view: View, point: { x: number; y: number }, viewport: Size): View {
  return { k: view.k, x: viewport.width / 2 - point.x * view.k, y: viewport.height / 2 - point.y * view.k };
}

/** Nodes whose box touches the viewport at this view. */
export function visibleNodes(nodes: readonly PlacedNode[], view: View, viewport: Size): Set<string> {
  const out = new Set<string>();
  for (const node of nodes) {
    const left = node.x * view.k + view.x;
    const top = node.y * view.k + view.y;
    const right = left + node.width * view.k;
    const bottom = top + node.height * view.k;
    if (right >= 0 && bottom >= 0 && left <= viewport.width && top <= viewport.height) out.add(node.id);
  }
  return out;
}

/**
 * Nodes shown with their full-size picture: those in view once the drawing is larger than
 * life. Below 1:1 the half-size picture is as sharp as the screen can show, and the full
 * files stay unfetched; null says "none".
 */
export function fullPictureNodes(nodes: readonly PlacedNode[], view: View, viewport: Size): Set<string> | null {
  return view.k > 1 ? visibleNodes(nodes, view, viewport) : null;
}

/** Where an arrow key leads. */
export type Direction = 'left' | 'right' | 'up' | 'down';

const HEADING: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

/**
 * The node an arrow key moves to: the nearest one whose centre lies within 45° of the
 * direction pressed. Nothing in that quadrant leaves the cursor where it is, so holding a
 * key at the edge of the drawing does not wander sideways.
 */
export function nextNodeInDirection(
  nodes: readonly PlacedNode[],
  fromId: string | null,
  direction: Direction,
): string | null {
  const from = nodes.find((node) => node.id === fromId);
  // no cursor yet: the arrow picks the node nearest the corner it comes from
  if (!from) return nodes.length ? [...nodes].sort(byReadingOrder)[0].id : null;
  const centre = (node: PlacedNode) => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
  const origin = centre(from);
  const heading = HEADING[direction];
  let best: { id: string; distance: number } | null = null;
  for (const node of nodes) {
    if (node.id === from.id) continue;
    const to = centre(node);
    const dx = to.x - origin.x;
    const dy = to.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    // the angle between this node and the direction pressed, folded into [0, π]
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - heading), Math.cos(Math.atan2(dy, dx) - heading)));
    if (off > Math.PI / 4) continue;
    if (!best || distance < best.distance) best = { id: node.id, distance };
  }
  return best?.id ?? fromId;
}

const byReadingOrder = (a: PlacedNode, b: PlacedNode) => a.y - b.y || a.x - b.x;
