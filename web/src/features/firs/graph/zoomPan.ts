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
export const ZOOM_STEP = 1.25;

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
