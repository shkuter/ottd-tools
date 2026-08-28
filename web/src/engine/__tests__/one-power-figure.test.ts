import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One figure for the power a vehicle makes, asked one way.
 *
 * `poweredOutputOn` answers "what does this vehicle contribute on this track" — nothing
 * unless the track powers it, its source's figure otherwise. Beneath it sit the two halves
 * of that answer, `isPoweredOn` and `vehiclePowerOn`, and either half alone is a plausible
 * mistake: the raw field states an electro-diesel's *diesel* power, and the source is
 * available to a metro engine on any track it is towed along.
 *
 * Both mistakes have been made here — a catalogue cell promising a figure its own summary
 * did not have, a sweep key drifting from the sweep it stands for — and neither showed up in
 * the numbers, because today's sets have no vehicle shaped to expose them. So the rule is
 * checked where it can be: in the source itself. A reader that needs one of the halves says
 * so by living in the module that owns them.
 */

/** Modules allowed to work with the halves: the owner, and the one that builds the data. */
const OWNS_THE_PARTS = ['engine/tracktypes.ts', 'vanilla.ts'];

/** What a reader must not reach for when it means "power on this track". */
const HALVES = ['vehiclePowerOn', '.power_hp', "['power_hp']"];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // tests may name the halves freely: they are what checks them
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...(await sourceFiles(path)));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

describe('the power a vehicle makes is asked one way', () => {
  it('no module outside the two that own the parts reaches for a half of the answer', async () => {
    const root = new URL('../..', import.meta.url).pathname;
    const offenders: string[] = [];

    for (const path of await sourceFiles(root)) {
      const relative = path.slice(root.length);
      if (OWNS_THE_PARTS.some((owner) => relative === owner)) continue;
      // data and generated dictionaries are not code that asks the question
      if (relative.startsWith('data/') || relative.startsWith('i18n/')) continue;

      const source = await readFile(path, 'utf8');
      for (const half of HALVES) {
        if (source.includes(half)) offenders.push(`${relative}: ${half}`);
      }
    }

    expect(offenders, 'ask poweredOutputOn instead — see the note above').toEqual([]);
  });
});
