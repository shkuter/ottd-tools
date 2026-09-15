// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { GraphCanvas } from '../GraphCanvas';
import type { BuiltGraph, Layout } from '../model';

const graph: BuiltGraph = {
  nodes: [
    { id: 'C:COAL', baseId: 'COAL', kind: 'cargo', notes: [], width: 150, height: 30 },
    { id: 'C:IORE', baseId: 'IORE', kind: 'cargo', notes: [], width: 150, height: 30 },
  ],
  edges: [],
  dot: 'digraph {}',
};
const layout: Layout = {
  nodes: [
    { id: 'C:COAL', x: 0, y: 0 },
    { id: 'C:IORE', x: 300, y: 0 },
  ],
  edges: [],
  width: 450,
  height: 30,
};

function draw(onSelect: (id: string | null) => void) {
  return render(
    <MantineProvider>
      <GraphCanvas
        graph={graph}
        layout={layout}
        economyId="STEELTOWN"
        selected={null}
        highlight={null}
        onSelect={onSelect}
        nameOf={(node) => node.baseId}
        modeOf={() => ''}
      />
    </MantineProvider>,
  );
}

const transform = (container: HTMLElement) => container.querySelector<HTMLElement>('.graph-layer')!.style.transform;
const scale = (container: HTMLElement) => Number(transform(container).match(/scale\(([\d.]+)\)/)![1]);

/** jsdom lays nothing out: the canvas is given a size, or the hook has no viewport to open the drawing in. */
function canvasOf(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GraphCanvas', () => {
  it('picks the node that is clicked', () => {
    const onSelect = vi.fn();
    draw(onSelect);
    fireEvent.click(screen.getByTitle('COAL'));
    expect(onSelect).toHaveBeenCalledWith('COAL');
  });

  it('leaves the pointer uncaptured until it travels, so a click reaches its node', () => {
    const { container } = draw(vi.fn());
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    // jsdom has no pointer capture; the calls are what matters — a captured pointer sends
    // its click to the canvas instead of the node
    const captured: number[] = [];
    canvas.setPointerCapture = (id: number) => void captured.push(id);
    canvas.releasePointerCapture = () => {};

    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 7 });
    expect(captured, 'a press alone captures nothing').toEqual([]);
    fireEvent.pointerMove(canvas, { clientX: 11, clientY: 11, pointerId: 7 });
    expect(captured, 'nor does a twitch below the threshold').toEqual([]);
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40, pointerId: 7 });
    expect(captured, 'a pan captures, to keep following past the edge').toEqual([7]);
    fireEvent.pointerUp(canvas);
  });

  it('does not pick the node a drag happens to end on', () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const canvas = container.querySelector('.graph-canvas')!;
    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40 });
    fireEvent.pointerUp(canvas);
    // the browser fires the click on whatever is under the pointer when it is released
    fireEvent.click(screen.getByTitle('IORE'));
    expect(onSelect).not.toHaveBeenCalled();
    // the next click is a click again
    fireEvent.click(screen.getByTitle('IORE'));
    expect(onSelect).toHaveBeenCalledWith('IORE');
  });

  it('forgets a drag that brought no click, so the next click is not eaten', async () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const canvas = container.querySelector('.graph-canvas')!;
    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40 });
    // released outside the canvas: the browser fires no click on it
    fireEvent.pointerUp(canvas);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByTitle('COAL'));
    expect(onSelect).toHaveBeenCalledWith('COAL');
  });

  it('finds a node: centres on it and picks it', () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const layer = () => container.querySelector<HTMLElement>('.graph-layer')!.style.transform;
    const before = layer();
    const input = container.querySelector<HTMLInputElement>('.graph-toolbar input')!;
    fireEvent.click(input);
    fireEvent.click(screen.getByRole('option', { name: 'IORE' }));
    expect(onSelect).toHaveBeenCalledWith('IORE');
    // the view moved to put the node in the middle
    expect(layer()).not.toBe(before);
  });

  it('keeps the view and the search across a language switch, and drops the search with the economy', () => {
    const onSelect = vi.fn();
    const props = { layout, selected: null, highlight: null, onSelect, modeOf: () => '' };
    const { container, rerender } = render(
      <MantineProvider>
        <GraphCanvas {...props} graph={graph} economyId="STEELTOWN" nameOf={(node) => node.baseId} />
      </MantineProvider>,
    );
    const layer = () => container.querySelector<HTMLElement>('.graph-layer')!.style.transform;
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(container.querySelector('.graph-toolbar input')!);
    fireEvent.click(screen.getByRole('option', { name: 'IORE' }));
    const zoomed = layer();
    // the same drawing worded in another language: a new graph object, the same layout
    const worded = { ...graph, nodes: graph.nodes.map((node) => ({ ...node })) };
    rerender(
      <MantineProvider>
        <GraphCanvas {...props} graph={worded} economyId="STEELTOWN" nameOf={(node) => `${node.baseId}!`} />
      </MantineProvider>,
    );
    expect(layer()).toBe(zoomed);
    expect(container.querySelector<HTMLInputElement>('.graph-toolbar input')!.value).toBe('IORE!');
    // another economy is another graph: the search is emptied
    rerender(
      <MantineProvider>
        <GraphCanvas {...props} graph={worded} economyId="BASIC_TEMPERATE" nameOf={(node) => node.baseId} />
      </MantineProvider>,
    );
    expect(container.querySelector<HTMLInputElement>('.graph-toolbar input')!.value).toBe('');
  });

  it('walks the nodes with the arrows, picks with Enter and clears with Escape', () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    expect(canvas.tabIndex, 'the canvas is one tab stop').toBe(0);
    expect(canvas.getAttribute('aria-activedescendant'), 'no cursor yet').toBeNull();

    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    // the first arrow lands on the first node, the second moves right to the other one
    expect(canvas.getAttribute('aria-activedescendant')).toBe('graph-node-C_COAL');
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(canvas.getAttribute('aria-activedescendant')).toBe('graph-node-C_IORE');
    expect(screen.getByTitle('IORE').dataset.focused).toBe('true');

    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('IORE');
    fireEvent.keyDown(canvas, { key: 'Escape' });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('leaves one finger to the page: it neither pans nor captures', () => {
    const { container } = draw(vi.fn());
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    const captured: number[] = [];
    canvas.setPointerCapture = (id: number) => void captured.push(id);
    const before = transform(container);

    fireEvent.pointerDown(canvas, { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerType: 'touch', pointerId: 1, clientX: 60, clientY: 140 });
    // the browser takes a finger that scrolls the page
    fireEvent.pointerCancel(canvas, { pointerType: 'touch', pointerId: 1 });
    expect(transform(container)).toBe(before);
    expect(captured).toEqual([]);
  });

  it('zooms with two fingers around the middle between them, and the gesture is not a pick', () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    const captured: number[] = [];
    canvas.setPointerCapture = (id: number) => void captured.push(id);
    const touch = { pointerType: 'touch' };

    fireEvent.pointerDown(canvas, { ...touch, pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerDown(canvas, { ...touch, pointerId: 2, clientX: 140, clientY: 20 });
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 1, clientX: 80, clientY: 20 });
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 2, clientX: 160, clientY: 20 });
    expect(scale(container), 'the fingers are twice as far apart').toBe(2);
    expect(captured, 'a finger is never captured').toEqual([]);
    fireEvent.pointerUp(canvas, { ...touch, pointerId: 1 });
    // the finger left behind does not carry the gesture on
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 2, clientX: 260, clientY: 90 });
    expect(scale(container)).toBe(2);
    const settled = transform(container);
    fireEvent.pointerUp(canvas, { ...touch, pointerId: 2 });
    expect(transform(container)).toBe(settled);

    fireEvent.click(screen.getByTitle('IORE'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('forgets a finger whose release never came, so a lone finger after it does not move the graph', () => {
    const { container } = draw(vi.fn());
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    const touch = { pointerType: 'touch' };

    fireEvent.pointerDown(canvas, { ...touch, isPrimary: true, pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerDown(canvas, { ...touch, isPrimary: false, pointerId: 2, clientX: 140, clientY: 20 });
    fireEvent.pointerUp(canvas, { ...touch, pointerId: 1 });
    // the release of finger 2 is lost on the way: the browser has nobody on the screen, the canvas
    // still has a ghost
    const before = transform(container);
    // the next finger is primary, as the first one on an empty screen always is
    fireEvent.pointerDown(canvas, { ...touch, isPrimary: true, pointerId: 3, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 3, clientX: 60, clientY: 140 });
    expect(transform(container), 'one finger is the page’s, ghost or no ghost').toBe(before);
  });

  it('drops a finger that leaves the canvas without a release', () => {
    const { container } = draw(vi.fn());
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    const touch = { pointerType: 'touch' };

    fireEvent.pointerDown(canvas, { ...touch, isPrimary: true, pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerDown(canvas, { ...touch, pointerId: 2, clientX: 140, clientY: 20 });
    fireEvent.lostPointerCapture(canvas, { ...touch, pointerId: 2 });
    const before = transform(container);
    fireEvent.pointerDown(canvas, { ...touch, pointerId: 3, clientX: 300, clientY: 20 });
    // fingers 1 and 3 make the pinch now, not the lost finger 2
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 2, clientX: 400, clientY: 20 });
    expect(transform(container)).toBe(before);
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 3, clientX: 500, clientY: 20 });
    expect(scale(container)).toBe(2);
  });

  it('carries a pinch on with the two fingers left when one of three lifts, without a jump', () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    const touch = { pointerType: 'touch' };

    fireEvent.pointerDown(canvas, { ...touch, isPrimary: true, pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerDown(canvas, { ...touch, pointerId: 2, clientX: 140, clientY: 20 });
    fireEvent.pointerDown(canvas, { ...touch, pointerId: 3, clientX: 200, clientY: 20 });
    // the third finger is not part of the pinch of the first two
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 2, clientX: 180, clientY: 20 });
    expect(scale(container), 'fingers 1 and 2 twice as far apart').toBe(2);

    fireEvent.pointerUp(canvas, { ...touch, pointerId: 1 });
    const repaired = transform(container);
    // fingers 2 (180) and 3 (200) pair up from the view reached, 20px apart
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 2, clientX: 180, clientY: 20 });
    expect(transform(container), 'the new pair starts where the old one left off').toBe(repaired);
    fireEvent.pointerMove(canvas, { ...touch, pointerId: 3, clientX: 220, clientY: 20 });
    expect(scale(container), 'the new pair twice as far apart doubles again').toBe(4);

    fireEvent.pointerUp(canvas, { ...touch, pointerId: 2 });
    fireEvent.pointerUp(canvas, { ...touch, pointerId: 3 });
    fireEvent.click(screen.getByTitle('IORE'));
    expect(onSelect, 'the gesture is not a pick').not.toHaveBeenCalled();
  });

  it('picks the node a finger taps without moving', () => {
    const onSelect = vi.fn();
    const { container } = draw(onSelect);
    const canvas = container.querySelector<HTMLElement>('.graph-canvas')!;
    const node = screen.getByTitle('COAL');
    fireEvent.pointerDown(node, { pointerType: 'touch', pointerId: 3, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(node, { pointerType: 'touch', pointerId: 3, clientX: 10, clientY: 10 });
    fireEvent.click(node);
    expect(onSelect).toHaveBeenCalledWith('COAL');
    expect(canvas.dataset.dragging).toBeUndefined();
  });

  it('opens a drawing too large to fit with labels, on its middle, and Fit drops them', () => {
    canvasOf(800, 600);
    const wide: Layout = { ...layout, nodes: [{ id: 'C:COAL', x: 0, y: 0 }, { id: 'C:IORE', x: 19850, y: 0 }], width: 20000 };
    const { container } = render(
      <MantineProvider>
        <GraphCanvas graph={graph} layout={wide} economyId="STEELTOWN" selected={null} highlight={null} onSelect={() => {}} nameOf={(node) => node.baseId} modeOf={() => ''} />
      </MantineProvider>,
    );
    const layer = () => container.querySelector<HTMLElement>('.graph-layer')!;
    expect(scale(container)).toBe(0.5);
    expect(layer().dataset.labels).toBeUndefined();
    // the middle of the drawing is in the middle of the canvas
    expect(transform(container)).toBe('translate(-4600px, 292.5px) scale(0.5)');
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }));
    expect(layer().dataset.labels).toBe('hidden');
  });

  it('opens a large drawing on the picked node', () => {
    canvasOf(800, 600);
    const wide: Layout = { ...layout, nodes: [{ id: 'C:COAL', x: 0, y: 0 }, { id: 'C:IORE', x: 19850, y: 0 }], width: 20000 };
    const { container } = render(
      <MantineProvider>
        <GraphCanvas graph={graph} layout={wide} economyId="STEELTOWN" selected="IORE" highlight={null} onSelect={() => {}} nameOf={(node) => node.baseId} modeOf={() => ''} />
      </MantineProvider>,
    );
    // IORE's centre is (19925, 15)
    expect(transform(container)).toBe(`translate(${400 - 19925 / 2}px, ${300 - 15 / 2}px) scale(0.5)`);
  });

  it('opens at natural size with labels', () => {
    canvasOf(800, 600);
    const { container } = draw(vi.fn());
    const layer = () => container.querySelector<HTMLElement>('.graph-layer')!;
    // the fixture layout is small, so it opens whole at 1:1 — not blown up to the zoom limit
    expect(scale(container)).toBe(1);
    expect(layer().dataset.labels).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(layer().dataset.labels).toBe('hidden');
  });

  it('keeps the search shut until the layout is there', () => {
    const { container, rerender } = render(
      <MantineProvider>
        <GraphCanvas graph={graph} layout={null} economyId="STEELTOWN" selected={null} highlight={null} onSelect={() => {}} nameOf={(node) => node.baseId} modeOf={() => ''} />
      </MantineProvider>,
    );
    expect(container.querySelector<HTMLInputElement>('.graph-toolbar input')!.disabled).toBe(true);
    expect(container.querySelector('.graph-loading')).not.toBeNull();
    rerender(
      <MantineProvider>
        <GraphCanvas graph={graph} layout={layout} economyId="STEELTOWN" selected={null} highlight={null} onSelect={() => {}} nameOf={(node) => node.baseId} modeOf={() => ''} />
      </MantineProvider>,
    );
    expect(container.querySelector<HTMLInputElement>('.graph-toolbar input')!.disabled).toBe(false);
  });
});
