import type { StateStorage } from 'zustand/middleware';

/** In-memory replacement for localStorage so persist middleware can run under node. */
export function memoryStorage(initial: Record<string, string> = {}): StateStorage & {
  dump: () => Record<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => void map.set(name, value),
    removeItem: (name) => void map.delete(name),
    dump: () => Object.fromEntries(map),
  };
}
