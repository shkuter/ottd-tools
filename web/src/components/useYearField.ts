import { useEffect, useRef, useState } from 'react';
import { clampGameYear } from '../engine/settings';

/**
 * Editing a year the way every year field in the calculator edits one. Both the calculation
 * year and the game's starting year go through here: one rule rather than a copy per field,
 * because copies drift — the calculator used to keep three years and two of them behaved
 * differently.
 *
 * What is typed is held here until the field is left, Enter is pressed, or the field goes
 * away. `onChange` fires per keystroke, and writing each one straight through would take the
 * setting past the year 1, then 19, then 197 on the way to 1975 — recomputing whatever reads
 * it and writing to localStorage at each step. Committing on the way out matters as much: a
 * tab is left by clicking a link, which in Safari and Firefox does not focus it, so no `blur`
 * arrives and the year typed last would otherwise be dropped.
 *
 * The caller passes no range: a year is bounded by what the game accepts, and an imported
 * savegame may state one outside any span a field would think to offer.
 */
export function useYearField(year: number, write: (year: number) => void) {
  const [typed, setTyped] = useState<string | number>(year);

  // the year changes elsewhere too — another field, a savegame import, a reset
  useEffect(() => setTyped(year), [year]);

  // the unmount commit runs with the state of its own render, so it reads the latest here
  const latest = useRef({ typed, year, write });
  useEffect(() => {
    latest.current = { typed, year, write };
  });

  const commit = () => {
    const { typed: held, year: current, write: put } = latest.current;
    const settled = clampGameYear(held, current);
    setTyped(settled);
    if (settled !== current) put(settled);
  };

  useEffect(() => () => commit(), []);

  return {
    value: typed,
    onChange: setTyped,
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commit();
    },
  };
}
