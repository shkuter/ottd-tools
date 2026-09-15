import { pinchView, type Point, type View } from './zoomPan';

interface Pinch {
  ids: [number, number];
  startMid: Point;
  startDistance: number;
  startView: View;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * The fingers on the canvas and the two-finger gesture they make, apart from the DOM: the hook
 * feeds it the pointers of `pointerType === 'touch'` and applies the views it returns.
 *
 * - One finger starts nothing: it is the page's to scroll with.
 * - A second finger starts a pinch, counted from the view on screen at that moment.
 * - A primary pointer going down starts a new touch sequence: the browser marks a finger primary
 *   only when no other finger is on the screen, so any finger still remembered is a ghost whose
 *   release never reached the canvas, and it is forgotten. Without that, a lone finger would
 *   pair with the ghost and move the graph.
 * - When a finger of the pinch lifts while two or more remain, the pinch goes on with two of
 *   those (the earliest down), counted afresh from the view it had reached, so the drawing does
 *   not jump. With fewer than two left the pinch ends and the finger left behind carries nothing
 *   on. A finger that lifts outside the pinch changes nothing.
 */
export class TouchGesture {
  private readonly touches = new Map<number, Point>();
  private pinch: Pinch | null = null;
  /** The last view the pinch led to, where a re-paired pinch starts from. */
  private reached: View | null = null;

  /** A finger lands at `at` (canvas coordinates); `view` is the view on screen now. */
  down(id: number, at: Point, primary: boolean, view: View): void {
    if (primary) {
      this.touches.clear();
      this.pinch = null;
    }
    this.touches.set(id, at);
    if (!this.pinch && this.touches.size >= 2) this.pair(view);
  }

  /** A finger moves; the view the pinch leads to, or null when this move leads nowhere. */
  move(id: number, at: Point): View | null {
    if (!this.touches.has(id)) return null;
    this.touches.set(id, at);
    const pinch = this.pinch;
    if (!pinch || !pinch.ids.includes(id)) return null;
    const a = this.touches.get(pinch.ids[0])!;
    const b = this.touches.get(pinch.ids[1])!;
    this.reached = pinchView(pinch.startView, pinch.startMid, pinch.startDistance, midpoint(a, b), distance(a, b));
    return this.reached;
  }

  /**
   * A finger is gone — lifted, cancelled, or lost to the canvas. True when that ended a pinch:
   * the release that follows a pinch is not a pick.
   */
  lift(id: number): boolean {
    if (!this.touches.delete(id)) return false;
    const pinch = this.pinch;
    if (!pinch || !pinch.ids.includes(id)) return false;
    if (this.touches.size >= 2) {
      this.pair(this.reached ?? pinch.startView);
      return false;
    }
    this.pinch = null;
    this.reached = null;
    return true;
  }

  private pair(view: View) {
    const [[a, pa], [b, pb]] = [...this.touches];
    this.pinch = { ids: [a, b], startMid: midpoint(pa, pb), startDistance: distance(pa, pb), startView: view };
    this.reached = view;
  }
}
