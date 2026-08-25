/**
 * Vitest runs under node, where `localStorage` does not exist and zustand's persist
 * middleware silently skips itself. A tiny in-memory Storage keeps the stores persistable
 * so their merge/partialize logic can be tested.
 */
const map = new Map<string, string>();
const storage: Storage = {
  get length() {
    return map.size;
  },
  clear: () => map.clear(),
  getItem: (k) => map.get(k) ?? null,
  key: (i) => [...map.keys()][i] ?? null,
  removeItem: (k) => void map.delete(k),
  setItem: (k, v) => void map.set(k, String(v)),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
// zustand reads `window.localStorage` specifically.
if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
}

/**
 * Component tests run under jsdom, which implements neither `matchMedia` (Mantine asks it
 * for the colour scheme) nor `ResizeObserver` (its overlays observe their target). Both are
 * stubbed here rather than in each test file.
 */
if (typeof window !== 'undefined' && window.matchMedia === undefined) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
// jsdom lays nothing out, so it implements no scrolling; Mantine's dropdowns keep the
// highlighted option in view and would otherwise throw past the end of a test
if (typeof Element !== 'undefined' && Element.prototype.scrollIntoView === undefined) {
  Element.prototype.scrollIntoView = () => {};
}
