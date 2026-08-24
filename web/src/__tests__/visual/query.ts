import type { ElementStyles, Snapshot } from './collect';

/**
 * Finding things in a snapshot. A component's own class is not always enough to
 * ask by — Mantine marks state with data-* attributes, and lettering often sits
 * in a child node it gives no class to — so there is one helper per way of
 * asking rather than one path expression per check.
 */

/** Elements carrying this class, wherever they are — portal included. */
export function byClass(shot: Snapshot, name: string) {
  return shot.elements.filter((element) => element.classes.includes(name));
}

/** First element carrying this class; throws when the page shows none. */
export function firstByClass(shot: Snapshot, name: string): ElementStyles {
  const found = byClass(shot, name);
  if (found.length === 0) throw new Error(`no element with class ${name} on ${shot.url}`);
  return found[0];
}

/** Elements carrying this data-* attribute (name without the `data-` prefix). */
export function byData(shot: Snapshot, name: string) {
  return shot.elements.filter((element) => name in element.data);
}

/**
 * Elements that draw text of their own inside a subtree — matched by the class
 * as it appears in the collected path. A component's lettering often sits in a
 * bare child node the library gives no class to, so the component itself has no
 * text to be asked about; its child does.
 */
export function textWithin(shot: Snapshot, within: string) {
  return shot.elements.filter((element) => element.path.includes(within) && element.ownText !== '');
}
