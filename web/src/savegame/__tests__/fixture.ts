import { readFileSync } from 'node:fs';

/** A real savegame from `fixtures/`, read as the browser would hand it over. */
export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}.sav`, import.meta.url)));
}
