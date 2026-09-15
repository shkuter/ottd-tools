import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TouchGesture } from './touchGesture';
import {
  ZOOM_STEP,
  centreOn,
  fitView,
  panBy,
  startView,
  zoomAt,
  zoomFactor,
  type Point,
  type Size,
  type View,
} from './zoomPan';

/** A mouse or pen press on the canvas, and whether it has travelled far enough to be a pan. */
interface Drag {
  x: number;
  y: number;
  moved: boolean;
}

/** What a kind of pointer does with the canvas events; `gone` only where losing the pointer matters. */
interface PointerHandler {
  down(event: React.PointerEvent<HTMLDivElement>): void;
  move(event: React.PointerEvent<HTMLDivElement>): void;
  up(event: React.PointerEvent<HTMLDivElement>): void;
  gone?(event: React.PointerEvent<HTMLDivElement>): void;
}

/**
 * Wheel to zoom around the cursor, drag to pan, two fingers to pan and zoom, and the buttons.
 * The wheel listener is attached by hand: React's is passive, and a passive listener cannot
 * keep the page from scrolling under the canvas.
 *
 * A mouse or a pen drags as it always did. A finger does not: one finger over the canvas
 * scrolls the page like anywhere else (`touch-action: pan-x pan-y` hands it to the browser),
 * and the canvas only takes a gesture once a second finger lands on it. A gesture the page
 * already scrolls with is the browser's — it cancels the first pointer and sends none for the
 * second — so nothing here has to tell the two apart. What the fingers do is TouchGesture's; the
 * handlers only pick, per pointer, between it and the mouse drag.
 *
 * A drag ends in a click as far as the browser is concerned, so the hook remembers whether
 * the pointer moved; the canvas asks before treating a click as a pick. The memory lasts
 * one task: the click follows the release in the same one, and a release outside the canvas
 * — captured, so still ours — brings no click at all.
 *
 * `focus` is the point of the drawing a new drawing opens on when it is too large to open
 * whole: the picked node, if there is one.
 */
export function useZoomPan(content: Size | null, focus?: Point | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const touch = useRef(new TouchGesture());
  const endedInDrag = useRef(false);
  const forget = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(forget.current ?? undefined), []);
  // a pinch starts from the view on screen, and a pointer handler has no render to read it from
  const current = useRef(view);
  const focusAt = useRef(focus);
  useLayoutEffect(() => {
    current.current = view;
    focusAt.current = focus;
  });

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

  // a new drawing (another economy) opens at a scale with labels; the language does not
  // change the drawing. The view is not rebuilt on resize: whatever the user had panned to
  // stays put
  const started = useRef<Size | null>(null);
  useEffect(() => {
    if (content && size.width && started.current !== content) {
      started.current = content;
      setView(startView(content, size, focusAt.current ?? undefined));
    }
  }, [content, size]);

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

  /** Remember that a gesture has just ended, for the click that may follow it in this task. */
  const endGesture = useCallback((moved: boolean) => {
    endedInDrag.current = moved;
    setDragging(false);
    // the click, if any, arrives before this runs; a release that brings none must not
    // leave the memory set for the next real click
    clearTimeout(forget.current ?? undefined);
    forget.current = setTimeout(() => {
      endedInDrag.current = false;
    }, 0);
  }, []);

  /** A mouse or a pen: press, travel past the threshold, release. */
  const mouse = useMemo<PointerHandler>(
    () => ({
      down(event: React.PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) return;
        dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
      },
      move(event: React.PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 3) return;
        if (!drag.moved) {
          setDragging(true);
          // Captured only once the pointer actually travels — a pan has to keep following it
          // past the edge of the canvas. Capturing on pointerdown instead would swallow every
          // click on a node: the compatibility click after a captured pointer is dispatched to
          // the element that held the capture, so the canvas would get it and read it as
          // "clicked the background".
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        drag.moved = true;
        drag.x = event.clientX;
        drag.y = event.clientY;
        setView((v) => panBy(v, dx, dy));
      },
      up() {
        const moved = dragRef.current?.moved ?? false;
        dragRef.current = null;
        endGesture(moved);
      },
      // no `gone`: leaving the canvas is not the end of a drag, it is captured and keeps following
    }),
    [endGesture],
  );

  /**
   * A finger: the gesture lives in TouchGesture. No pointer capture — a touch is captured to the
   * element it landed on already and bubbles up here, and capturing on the way down is what
   * swallows a click. A pinch is never a pick, and neither is its last lift.
   */
  const finger = useMemo<PointerHandler>(() => {
    const at = (event: React.PointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const lift = (event: React.PointerEvent<HTMLDivElement>) => {
      if (touch.current.lift(event.pointerId)) endGesture(true);
    };
    return {
      down(event: React.PointerEvent<HTMLDivElement>) {
        touch.current.down(event.pointerId, at(event), event.isPrimary, current.current);
      },
      move(event: React.PointerEvent<HTMLDivElement>) {
        const next = touch.current.move(event.pointerId, at(event));
        if (next) setView(next);
      },
      up: lift,
      gone: lift,
    };
  }, [endGesture]);

  const handlerFor = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): PointerHandler => (event.pointerType === 'touch' ? finger : mouse),
    [finger, mouse],
  );

  const handlers = useMemo(
    () => ({
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => handlerFor(event).down(event),
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => handlerFor(event).move(event),
      // a cancel is a release as far as the gesture goes: the browser takes a finger that
      // started scrolling the page, and the canvas lets go of it
      onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => handlerFor(event).up(event),
      onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => handlerFor(event).up(event),
      // A finger whose release never reaches the canvas would linger as a ghost: whatever
      // else tells the canvas the pointer is no longer its own drops it too. Not pointerout —
      // that fires on every move from one node to another inside the canvas.
      onPointerLeave: (event: React.PointerEvent<HTMLDivElement>) => handlerFor(event).gone?.(event),
      onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => handlerFor(event).gone?.(event),
    }),
    [handlerFor],
  );

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
    handlers,
  };
}
