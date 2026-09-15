/**
 * Holding several leading columns of a list: each held cell stands where the columns before it
 * end, the edge goes on the last of them, and a window too narrow for all of them holds only
 * the first. jsdom lays nothing out, so the widths are handed to it cell by cell.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider, Table } from '@mantine/core';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableFrame } from '../TableFrame';
import { pinLeadingColumns } from '../usePinnedLeadingColumns';

/** Widths of the body cells of the sample table, in order: #, tick, sprite, name, then data. */
const WIDTHS = [30, 20, 60, 140, 80, 80, 80];

/**
 * A table shaped like Best train's: the heading of the engine spans its sprite and its name.
 * Each body cell reports its width through `data-width`, which getBoundingClientRect reads.
 */
function SampleTable() {
  return (
    <>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>#</Table.Th>
          <Table.Th />
          <Table.Th colSpan={2}>Engine</Table.Th>
          <Table.Th>a</Table.Th>
          <Table.Th>b</Table.Th>
          <Table.Th>c</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {[0, 1].map((row) => (
          <Table.Tr key={row}>
            {WIDTHS.map((width, cell) => (
              <Table.Td key={cell} data-width={width}>
                {cell}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </>
  );
}

/** Makes every element report the width its `data-width` names, and the frame its client width. */
function layOut(frameWidth: { current: number }) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const width = Number(this.getAttribute('data-width') ?? 0);
    return { width, height: 20, left: 0, top: 0, right: width, bottom: 20, x: 0, y: 0 } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('table-wrap') ? frameWidth.current : 0;
  });
}

function draw() {
  return render(
    <MantineProvider>
      <TableFrame pinEdges pinLeading={4} rowCount={2} emptyMessage="none">
        <SampleTable />
      </TableFrame>
    </MantineProvider>,
  );
}

const frame = () => document.querySelector<HTMLElement>('.table-wrap')!;
const bodyCells = () => [...document.querySelectorAll<HTMLElement>('tbody tr:first-child td')];
const headCells = () => [...document.querySelectorAll<HTMLElement>('thead th')];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('holding the leading columns', () => {
  it('stands each held cell where the columns before it end, counting spans in the header', () => {
    layOut({ current: 1000 });
    draw();

    const body = bodyCells();
    expect(body.slice(0, 4).map((cell) => cell.style.left)).toEqual(['0px', '30px', '50px', '110px']);
    expect(body.slice(0, 4).every((cell) => cell.classList.contains('pin-lead'))).toBe(true);
    expect(body[4].classList.contains('pin-lead')).toBe(false);
    expect(body[4].style.left).toBe('');

    // the header's engine cell starts at the sprite column and spans the name
    const head = headCells();
    expect(head.slice(0, 3).map((cell) => cell.style.left)).toEqual(['0px', '30px', '50px']);
    expect(head[3].classList.contains('pin-lead')).toBe(false);
  });

  it('puts the edge on the cell that ends on the last held column', () => {
    layOut({ current: 1000 });
    draw();

    expect(bodyCells().map((cell) => cell.classList.contains('pin-lead-last'))).toEqual([
      false, false, false, true, false, false, false,
    ]);
    expect(headCells().map((cell) => cell.classList.contains('pin-lead-last'))).toEqual([
      false, false, true, false, false, false,
    ]);
    expect(frame().classList.contains('pin-leading')).toBe(true);
  });

  it('holds only the first column when the held ones would take over half the width', () => {
    // 250px of held columns in a 400px frame
    layOut({ current: 400 });
    draw();

    const body = bodyCells();
    expect(body[0].style.left).toBe('0px');
    expect(body[0].classList.contains('pin-lead-last')).toBe(true);
    for (const cell of body.slice(1, 4)) {
      expect(cell.style.left).toBe('');
      expect(cell.classList.contains('pin-lead')).toBe(false);
      expect(cell.classList.contains('pin-lead-last')).toBe(false);
    }
    expect(headCells()[2].classList.contains('pin-lead-last')).toBe(false);
  });

  it('takes back what a wider window gave when the window narrows, and returns it when it widens', () => {
    const width = { current: 1000 };
    layOut(width);
    // the observer the frame sets up, captured so a resize can be played back
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
    draw();
    expect(bodyCells()[3].classList.contains('pin-lead-last')).toBe(true);
    expect(callbacks.length).toBeGreaterThan(0);

    const resize = () =>
      act(() => callbacks.forEach((callback) => callback([], {} as ResizeObserver)));

    width.current = 400;
    resize();
    expect(bodyCells()[3].style.left).toBe('');
    expect(bodyCells()[3].classList.contains('pin-lead')).toBe(false);
    expect(bodyCells()[0].classList.contains('pin-lead-last')).toBe(true);

    width.current = 1000;
    resize();
    expect(bodyCells()[3].style.left).toBe('110px');
    expect(bodyCells()[3].classList.contains('pin-lead-last')).toBe(true);
    expect(bodyCells()[0].classList.contains('pin-lead-last')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('watches the new table when an emptied list brings one back, and lets the old one go', () => {
    layOut({ current: 1000 });
    const observed = new Set<Element>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(target: Element) {
          observed.add(target);
        }
        unobserve(target: Element) {
          observed.delete(target);
        }
        disconnect() {
          observed.clear();
        }
      },
    );
    const frameOf = (rows: number) => (
      <MantineProvider>
        <TableFrame pinEdges pinLeading={4} rowCount={rows} emptyMessage="none">
          <SampleTable />
        </TableFrame>
      </MantineProvider>
    );
    const { rerender } = render(frameOf(2));
    const first = document.querySelector('table')!;
    expect(observed.has(first)).toBe(true);

    rerender(frameOf(0));
    rerender(frameOf(2));
    const second = document.querySelector('table')!;
    expect(second).not.toBe(first);
    expect(observed.has(second), 'the table now on the page is watched').toBe(true);
    expect(observed.has(first), 'the table gone from the page is not').toBe(false);
    expect(observed.has(frame())).toBe(true);
    vi.unstubAllGlobals();
  });

  it('lets a cell spanning past the held columns scroll with the rest', () => {
    layOut({ current: 1000 });
    const holder = document.createElement('div');
    holder.innerHTML =
      '<table><tbody><tr><td data-width="30">1</td><td data-width="20"></td>' +
      '<td data-width="60"></td><td data-width="140"></td></tr>' +
      '<tr><td colspan="4">opened in place</td></tr></tbody></table>';
    pinLeadingColumns(holder, 2);
    const detail = holder.querySelector<HTMLElement>('tr:last-child td')!;
    expect(detail.classList.contains('pin-lead')).toBe(false);
    expect(detail.style.left).toBe('');
  });
});
