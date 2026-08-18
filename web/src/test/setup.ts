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
