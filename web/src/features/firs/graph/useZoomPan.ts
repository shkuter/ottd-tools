import { useCallback, useEffect, useRef, useState } from 'react';
import { ZOOM_STEP, centreOn, fitView, panBy, zoomAt, zoomFactor, type Size, type View } from './zoomPan';

/**
 * Wheel to zoom around the cursor, drag to pan, and the buttons. The wheel listener is
 * attached by hand: React's is passive, and a passive listener cannot keep the page from
 * scrolling under the canvas.
 *
 * A drag ends in a click as far as the browser is concerned, so the hook remembers whether
 * the pointer moved; the canvas asks before treating a click as a pick. The memory lasts
 * one task: the click follows the release in the same one, and a release outside the canvas
 * — captured, so still ours — brings no click at all.
 */
export function useZoomPan(content: Size | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const endedInDrag = useRef(false);
  const forget = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(forget.current ?? undefined), []);

  // the viewport is measured once and on resize, not read off the DOM during a render
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (content && size.width) setView(fitView(content, size));
  }, [content, size]);

  // a new drawing (another economy) starts fitted; the language does not change the drawing.
  // The view is not refitted on resize: whatever the user had panned to stays put
  const fitted = useRef<Size | null>(null);
  useEffect(() => {
    if (content && size.width && fitted.current !== content) {
      fitted.current = content;
      fit();
    }
  }, [content, size, fit]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      // by how far the gesture scrolled, not by how many events it arrived in: a trackpad
      // sends dozens of small ones where a mouse sends one notch
      const factor = zoomFactor(event.deltaY, event.deltaMode, box.height);
      setView((v) => zoomAt(v, factor, event.clientX - box.left, event.clientY - box.top));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => setView((v) => zoomAt(v, factor, size.width / 2, size.height / 2)),
    [size],
  );
  const actual = useCallback(
    () => setView((v) => zoomAt(v, 1 / v.k, size.width / 2, size.height / 2)),
    [size],
  );
  const centre = useCallback(
    (point: { x: number; y: number }) => setView((v) => centreOn(v, point, size)),
    [size],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  }, []);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved) {
      setDragging(true);
      // Captured only once the pointer actually travels — a pan has to keep following it
      // past the edge of the canvas. Capturing on pointerdown instead would swallow every
      // click on a node: the compatibility click after a captured pointer is dispatched to
      // the element that held the capture, so the canvas would get it and read it as
      // "clicked the background".
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    d.moved = true;
    d.x = event.clientX;
    d.y = event.clientY;
    setView((v) => panBy(v, dx, dy));
  }, []);
  const onPointerUp = useCallback(() => {
    endedInDrag.current = drag.current?.moved ?? false;
    drag.current = null;
    setDragging(false);
    // the click, if any, arrives before this runs; a release that brings none must not
    // leave the memory set for the next real click
    forget.current = setTimeout(() => {
      endedInDrag.current = false;
    }, 0);
  }, []);
  /** Did the pointer just finish a drag? Asked by the click handler that follows it. */
  const consumeDrag = useCallback(() => {
    const moved = endedInDrag.current;
    endedInDrag.current = false;
    return moved;
  }, []);

  return {
    ref,
    view,
    size,
    dragging,
    fit,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    actual,
    centre,
    consumeDrag,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
