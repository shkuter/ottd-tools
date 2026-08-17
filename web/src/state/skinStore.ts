import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Look of the interface. Deliberately kept out of GameSettings/CalcSettings:
 * those must all affect the calculation (see CLAUDE.md), and a skin does not.
 *
 * `pixel` and `soft` are the two OpenGFX2 Classic variants offered for a
 * side-by-side demo; `web` is the original dark theme.
 */
export type Skin = 'web' | 'pixel' | 'soft';

interface SkinState {
  skin: Skin;
  setSkin: (skin: Skin) => void;
}

export const useSkinStore = create<SkinState>()(
  persist(
    (set) => ({
      skin: 'pixel',
      setSkin: (skin) => set({ skin }),
    }),
    { name: 'ottd-tools-skin' },
  ),
);
