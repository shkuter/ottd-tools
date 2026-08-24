import { describe, expect, it } from 'vitest';
import { nextSort, sortRows, type SortValues } from '../sorting';

/**
 * The sorting mechanism itself, on rows invented here: the module knows nothing about vehicles
 * or routes, and a test that fed it a real optimizer result would be measuring the optimizer.
 * What a column of a real list compares by is checked beside that list — see
 * features/optimizer/__tests__/sorting.test.ts.
 */

const collator = new Intl.Collator('ru');

interface Row {
  name: string;
  score: number;
  /** null stands for "this row has no value here" — the cell would draw an em dash */
  rating: number | null;
}

const VALUES = {
  name: (r: Row) => r.name,
  score: (r: Row) => r.score,
  rating: (r: Row) => r.rating,
} satisfies SortValues<Row, string>;

const rows: Row[] = [
  { name: 'бета', score: 2, rating: 0.5 },
  { name: 'альфа', score: 3, rating: null },
  { name: 'гамма', score: 1, rating: 0.9 },
  { name: 'дельта', score: 4, rating: null },
];

describe('сортировка списка', () => {
  it('без сортировки — порядок, в котором строки пришли', () => {
    expect(sortRows(rows, null, VALUES, collator)).toEqual([...rows]);
  });

  it('по числовой колонке: по возрастанию и по убыванию', () => {
    const up = sortRows(rows, { column: 'score', descending: false }, VALUES, collator);
    const down = sortRows(rows, { column: 'score', descending: true }, VALUES, collator);
    expect(up.map((r) => r.score)).toEqual([1, 2, 3, 4]);
    expect(down.map((r) => r.score)).toEqual([4, 3, 2, 1]);
  });

  it('по текстовой колонке — по языку, а не по порядку данных', () => {
    const byName = sortRows(rows, { column: 'name', descending: false }, VALUES, collator);
    const names = byName.map((r) => r.name);
    expect(names).toEqual([...names].sort(collator.compare));
    expect(names[0]).toBe('альфа');
  });

  it('строки без значения уходят вниз при обоих направлениях', () => {
    // Заглушка вроде -1 или Infinity встала бы в начало, стоит развернуть направление.
    for (const descending of [false, true]) {
      const sorted = sortRows(rows, { column: 'rating', descending }, VALUES, collator);
      expect(sorted).toHaveLength(rows.length);
      expect(sorted.slice(0, 2).every((r) => r.rating !== null)).toBe(true);
      expect(sorted.slice(2).every((r) => r.rating === null)).toBe(true);
    }
  });

  it('состав и сами строки не меняются — сортировка только переставляет', () => {
    const sorted = sortRows(rows, { column: 'score', descending: true }, VALUES, collator);
    expect(new Set(sorted)).toEqual(new Set(rows));
    for (const row of rows) expect(sorted).toContain(row);
  });

  it('исходный массив не мутируется', () => {
    const before = [...rows];
    sortRows(rows, { column: 'score', descending: true }, VALUES, collator);
    expect(rows).toEqual(before);
  });
});

describe('цикл щелчков по заголовку', () => {
  it('возрастание → убывание → порядок по умолчанию', () => {
    const first = nextSort(null, 'score');
    expect(first).toEqual({ column: 'score', descending: false });
    const second = nextSort(first, 'score');
    expect(second).toEqual({ column: 'score', descending: true });
    expect(nextSort(second, 'score')).toBeNull();
  });

  it('щелчок по другой колонке начинает с возрастания', () => {
    const onScore = { column: 'score' as const, descending: true };
    expect(nextSort(onScore, 'name')).toEqual({ column: 'name', descending: false });
  });
});
