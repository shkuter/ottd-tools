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

afterEach(cleanup);

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

  it('drops the labels on the overview and keeps them close up', () => {
    const { container } = draw(vi.fn());
    const layer = () => container.querySelector<HTMLElement>('.graph-layer')!;
    // the fixture layout is small, so it opens fitted at the maximum zoom: labels on
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
