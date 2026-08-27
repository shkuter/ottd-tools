import { Image } from '@mantine/core';
import gui from '../data/vanilla_gui.json';

/**
 * The icons of the game's own interface. The names are the extractor's, read off
 * the data rather than listed again here: a name added to `GUI_SPRITES` and
 * forgotten in a hand-written union is a picture nobody can ask for.
 */
export type GuiIconName = keyof typeof gui.icons;

/**
 * An icon the interface borrows from the game, standing in for a label that
 * would otherwise be half a filter row long. It carries no name of its own: the
 * control it sits in is what gets named, so the icon stays out of the accessible
 * name instead of doubling it.
 */
export function GuiIcon({ name }: { name: GuiIconName }) {
  return (
    <Image
      className="gui-icon"
      src={`${import.meta.env.BASE_URL}icons/vanilla_gui/${name}.png`}
      alt=""
      loading="lazy"
    />
  );
}
