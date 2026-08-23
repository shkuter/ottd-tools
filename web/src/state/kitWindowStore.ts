import { create } from 'zustand';
import { WINDOW_COLOURS, type WindowColour } from '../skin';

/**
 * Which window colour the interface-elements page is showing its dropdowns,
 * tooltips and notifications in.
 *
 * Those render into a portal under <body>, so only the attribute on <html>
 * reaches them — and that attribute has exactly one writer, the shell (see the
 * effect in App.tsx). The page changes this value and the shell applies it;
 * writing the attribute from both would leave the winner to effect order, where
 * a child runs before its parent and the page would be overwritten on entry.
 *
 * Not persisted: it is a working state of a developer page, not a preference.
 */
interface KitWindowState {
  colour: WindowColour;
  setColour: (colour: WindowColour) => void;
}

export const useKitWindowStore = create<KitWindowState>((set) => ({
  colour: WINDOW_COLOURS[0],
  setColour: (colour) => set({ colour }),
}));
