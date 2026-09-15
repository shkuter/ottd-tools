/**
 * The hint that a list has columns further right: on while the table is wider than its frame
 * and not scrolled to the end, off at the end and when it fits, kept up to date on a scroll and
 * a resize. jsdom lays nothing out, so the scroll metrics are handed to it.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider, Table } from '@mantine/core';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableFrame } from '../TableFrame';

interface Metrics {
  scrollWidth: number;
  clientWidth: number;
}

/** The frame reports these metrics; its scrollLeft is jsdom's own and set by the test. */
function layOut(metrics: Metrics) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('table-wrap') ? metrics.scrollWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('table-wrap') ? metrics.clientWidth : 0;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const width = Number(this.getAttribute('data-width') ?? 0);
    return { width, height: 20, left: 0, top: 0, right: width, bottom: 20, x: 0, y: 0 } as DOMRect;
  });
}

/** Captures the observers the frame sets up, so a resize can be played back. */
function observers() {
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  return () => act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)));
}

function draw({ pinned }: { pinned: boolean }) {
  return render(
    <MantineProvider>
      <TableFrame pinEdges={pinned} rowCount={1} emptyMessage="none">
        <Table.Tbody>
          <Table.Tr>
            <Table.Td data-width={100}>name</Table.Td>
            <Table.Td data-width={100}>figure</Table.Td>
            {/* the stylesheet is not loaded in jsdom: the held last cell says so itself */}
            <Table.Td data-width={48} style={pinned ? { position: 'sticky', right: 0 } : undefined}>
              action
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </TableFrame>
    </MantineProvider>,
  );
}

const frame = () => document.querySelector<HTMLElement>('.table-wrap')!;
const holder = () => document.querySelector<HTMLElement>('.table-frame')!;
const hint = () => document.querySelector<HTMLElement>('.table-overflow-hint')!;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the hint of columns further right', () => {
  it('is on while the table overflows at the start of the scroll', () => {
    layOut({ scrollWidth: 800, clientWidth: 500 });
    draw({ pinned: true });
    expect(frame().hasAttribute('data-more-end')).toBe(true);
  });

  it('goes at the end of the scroll and comes back on the way back, on the scroll event', () => {
    layOut({ scrollWidth: 800, clientWidth: 500 });
    draw({ pinned: true });
    frame().scrollLeft = 300;
    fireEvent.scroll(frame());
    expect(frame().hasAttribute('data-more-end')).toBe(false);
    frame().scrollLeft = 120;
    fireEvent.scroll(frame());
    expect(frame().hasAttribute('data-more-end')).toBe(true);
  });

  it('is off for a table that fits, and follows a resize', () => {
    const metrics = { scrollWidth: 500, clientWidth: 500 };
    layOut(metrics);
    const resize = observers();
    draw({ pinned: true });
    expect(frame().hasAttribute('data-more-end')).toBe(false);
    metrics.clientWidth = 300;
    resize();
    expect(frame().hasAttribute('data-more-end')).toBe(true);
    metrics.clientWidth = 800;
    metrics.scrollWidth = 800;
    resize();
    expect(frame().hasAttribute('data-more-end')).toBe(false);
  });

  it('stops where the column held at the right edge begins, and at the edge without one', () => {
    layOut({ scrollWidth: 800, clientWidth: 500 });
    draw({ pinned: true });
    expect(holder().style.getPropertyValue('--table-pinned-end')).toBe('48px');
    cleanup();
    draw({ pinned: false });
    expect(holder().style.getPropertyValue('--table-pinned-end')).toBe('0px');
  });

  it('is no tab stop and no announcement', () => {
    layOut({ scrollWidth: 800, clientWidth: 500 });
    draw({ pinned: true });
    expect(hint().getAttribute('aria-hidden')).toBe('true');
    expect(hint().hasAttribute('tabindex')).toBe(false);
    expect(hint().querySelector('[tabindex], button, a')).toBeNull();
  });
});
