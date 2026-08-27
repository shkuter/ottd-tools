/**
 * Слеш между двумя числами и слеш в значении «на». Спека требует писать его без
 * пробелов, и следят за этим два разных сторожа: словари проверяются в
 * `i18n/__tests__/locales.test.ts`, а здесь — то, что собирается в коде из
 * нескольких кусков и в словари не попадает.
 *
 * Ровно эта половина и разошлась: «Груз за рейс» на вкладке дохода печаталась
 * как `{a} / {b}`, тогда как та же величина на вкладке подбора шла слитно.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Пара, собранная в разметке: `{…} / {…}`, где слеш отбит пробелом хотя бы с
 * одной стороны. Самозакрывающийся тег (`} />`) выглядит так же посимвольно,
 * поэтому слеш, за которым идёт `>`, не считается.
 */
const SPACED_PAIRS = [
  /\}\s+\/(?!>)\s*\{/,
  /\}\s*\/\s+\{/,
  /\$\{[^}]*\}\s+\/(?!>)/,
  /\/\s+\$\{/,
];

describe('слеш между значениями', () => {
  it('нигде в разметке не отбит пробелами', () => {
    const found: string[] = [];
    for (const file of globSync(join(root, '**/*.{ts,tsx}'))) {
      if (file.includes('__tests__')) continue;
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, index) => {
        if (SPACED_PAIRS.some((shape) => shape.test(line))) {
          found.push(`${relative(root, file)}:${index + 1}: ${line.trim().slice(0, 72)}`);
        }
      });
    }

    expect(found, 'пара чисел пишется через слеш без пробелов').toEqual([]);
  });
});
