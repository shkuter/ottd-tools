/**
 * The column beside the chain graph: the legend until a node is picked, the node card after,
 * and on a narrow window a scroll that brings a new pick's card into sight.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FirsPage from '../FirsPage';
import { useFirsStore } from '../../../state/firsStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/firs']}>
        <FirsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

const side = (container: HTMLElement) => container.querySelector<HTMLElement>('aside.firs-side')!;

/** Where the card is measured to be, and whether the system asks for less motion. */
function geometry({ top, bottom, reduce = false }: { top: number; bottom: number; reduce?: boolean }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const box = this.matches('aside.firs-side') ? { top, bottom } : { top: 0, bottom: 0 };
    return { ...box, x: 0, y: box.top, left: 0, right: 0, width: 0, height: box.bottom - box.top, toJSON: () => ({}) };
  });
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  return vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.getState().setGame('firs', true);
  useSettingsStore.getState().setGame('firsEconomy', 'STEELTOWN');
  useFirsStore.setState({ selectedNode: null, chainTargetId: null, economyId: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the column beside the graph', () => {
  it('shows the legend until a node is picked, the card after, and the legend again on Escape', async () => {
    const { container } = draw();
    expect(side(container).querySelector('.graph-legend')).not.toBeNull();
    expect(side(container).querySelector('.node-card')).toBeNull();
    // the industry sample shows what an industry card does: its picture, its name, its accept mode
    expect(side(container).querySelector('.graph-legend__industry img')).not.toBeNull();
    expect(side(container).querySelector('.graph-legend__mode')?.textContent).toMatch(/inputs/);

    const node = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('.graph-canvas .graph-node--industry');
      if (!found) throw new Error('the graph is not laid out yet');
      return found;
    });
    fireEvent.click(node);
    expect(side(container).querySelector('.node-card')).not.toBeNull();
    expect(side(container).querySelector('.graph-legend')).toBeNull();

    fireEvent.keyDown(container.querySelector('.graph-canvas')!, { key: 'Escape' });
    expect(side(container).querySelector('.graph-legend')).not.toBeNull();
    expect(side(container).querySelector('.node-card')).toBeNull();
  });

  it('rewords the legend in the language picked', () => {
    const { container } = draw();
    expect(side(container).textContent).toContain('How to read the graph');
    act(() => useLocaleStore.getState().setLocale('ru'));
    expect(side(container).textContent).toContain('Как читать граф');
    expect(side(container).textContent).not.toContain('How to read the graph');
  });
});

describe('bringing the card of a pick into view', () => {
  const pick = (node: string | null) => act(() => useFirsStore.getState().setSelectedNode(node));

  it('scrolls a card below the window into view, smoothly', () => {
    const scroll = geometry({ top: 1000, bottom: 1400 });
    draw();
    pick('COAL');
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('jumps instead when the system asks for less motion', () => {
    const scroll = geometry({ top: 1000, bottom: 1400, reduce: true });
    draw();
    pick('COAL');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });

  it('leaves the page alone when the card is already in sight, and when the pick is cleared', () => {
    const scroll = geometry({ top: 100, bottom: 600 });
    draw();
    pick('COAL');
    pick(null);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not scroll on coming back to the tab with a pick, only on the next pick', () => {
    const scroll = geometry({ top: 1000, bottom: 1400 });
    useFirsStore.setState({ selectedNode: 'COAL', economyId: 'STEELTOWN' });
    draw();
    expect(scroll).not.toHaveBeenCalled();
    pick('IORE');
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
