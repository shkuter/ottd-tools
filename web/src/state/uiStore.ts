import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * State of the interface itself: which "How it's computed" blocks are open.
 *
 * Kept out of GameSettings/CalcSettings because it changes no figure — every setting there has
 * to (CLAUDE.md) — and out of the top-level fields of the settings store, which hold how figures
 * are presented and are wiped by "reset all". Like the language, what a player chose to read is
 * not something a reset of the calculation should take away, so this store is not in the
 * registry of `state/index.ts`.
 */

/** Where the state lives; exported so checks address the real key, not a copy of it. */
export const UI_KEY = 'ottd-tools-ui';

/**
 * Versioned from the first write: a key stored without a version reads as version 0, and every
 * future `migrate` branch of the form `version < N` would then misjudge what it holds.
 */
export const UI_VERSION = 1;

/**
 * Every "How it's computed" block, by the place it stands. A closed set rather than free strings:
 * the id is a key kept across reloads, so a typo would quietly open a block nobody has, and a
 * renamed one would forget what its players chose.
 *
 * `kit.specimen` is the block on the element kit page. It is stored like the real ones — the kit
 * draws the component as it is — and has an id of its own, so opening the specimen opens nothing
 * on a real tab.
 */
export type HowComputedId =
  | 'optimizer'
  | 'route'
  | 'network.maintenance'
  | 'network.corridor'
  | 'network.signals'
  | 'kit.specimen';

interface UiState {
  /** Open or folded, per block; a block never toggled is folded. */
  howComputedOpen: Partial<Record<HowComputedId, boolean>>;
  setHowComputedOpen: (id: HowComputedId, open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      howComputedOpen: {},
      setHowComputedOpen: (id, open) =>
        set((state) => ({ howComputedOpen: { ...state.howComputedOpen, [id]: open } })),
    }),
    {
      name: UI_KEY,
      version: UI_VERSION,
      partialize: (state) => ({ howComputedOpen: state.howComputedOpen }),
    },
  ),
);
