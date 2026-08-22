import { describe, expect, it } from 'vitest';
import { nextSort, sortRows } from '../sorting';
import { cargoByLabel, industriesMeta, industryById, trains, trainsMeta } from '../../../dataset';
import { optimizeConsists } from '../../../engine/optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

const collator = new Intl.Collator('ru');

const rows = optimizeConsists(
  trains,
  {
    year: 1938,
    cargo: cargoByLabel.get('COAL')!,
    economyId: 'STEELTOWN',
    allowElectric: false,
    maxLengthTiles: 6,
    distanceTiles: 300,
    productionPerMonth: 200,
    goal: 'supply',
    supplyTarget: {
      industry: industryById.get('coke_oven')!,
      windowTicks: industriesMeta.supply_window_ticks,
      cargoRatio: 8,
      otherRatios: [],
    },
    maxTrains: 6,
    game: DEFAULT_GAME_SETTINGS,
    calc: DEFAULT_CALC_SETTINGS,
  },
  trainsMeta,
  20,
);

describe('сортировка выдачи', () => {
  it('есть что сортировать', () => {
    expect(rows.length).toBeGreaterThan(2);
  });

  it('без сортировки — порядок поиска', () => {
    expect(sortRows(rows, null, collator)).toEqual([...rows]);
  });

  it('по числовой колонке: по возрастанию и по убыванию', () => {
    const up = sortRows(rows, { column: 'profit', descending: false }, collator);
    const down = sortRows(rows, { column: 'profit', descending: true }, collator);
    for (let i = 1; i < up.length; i++) {
      expect(up[i].profitPerYear).toBeGreaterThanOrEqual(up[i - 1].profitPerYear);
    }
    expect(down.map((r) => r.profitPerYear)).toEqual(
      [...up].reverse().map((r) => r.profitPerYear),
    );
  });

  it('по текстовой колонке — по названию, а не по порядку данных', () => {
    const byName = sortRows(rows, { column: 'engine', descending: false }, collator);
    const names = byName.map((r) => r.engine.name);
    expect(names).toEqual([...names].sort(collator.compare));
  });

  it('строки без вердикта снабжения уходят вниз при обоих направлениях', () => {
    // Половине строк вердикт стираем: они должны оказаться в конце и при возрастании, и при
    // убывании — заглушка вроде Infinity всплывала бы наверх при развороте.
    const mixed = rows.map((r, i) => (i % 2 === 0 ? r : { ...r, supply: null }));
    const rated = mixed.filter((r) => r.supply).length;
    expect(rated).toBeGreaterThan(0);
    expect(rated).toBeLessThan(mixed.length);

    for (const descending of [false, true]) {
      const sorted = sortRows(mixed, { column: 'supply', descending }, collator);
      const tail = sorted.slice(rated);
      expect(sorted).toHaveLength(mixed.length);
      expect(tail.every((r) => r.supply === null)).toBe(true);
      expect(sorted.slice(0, rated).every((r) => r.supply !== null)).toBe(true);
    }
  });

  it('окупаемость «никогда» тоже уходит вниз, а не в начало при развороте', () => {
    const mixed = rows.map((r, i) => (i % 2 === 0 ? r : { ...r, paybackYears: null }));
    const rated = mixed.filter((r) => r.paybackYears !== null).length;
    for (const descending of [false, true]) {
      const sorted = sortRows(mixed, { column: 'payback', descending }, collator);
      expect(sorted.slice(rated).every((r) => r.paybackYears === null)).toBe(true);
    }
  });

  it('получатель с пулом: сортировка идёт по бонусу производства, а не по отношению', () => {
    // Колонка для пула показывает бонус, поэтому и сортируется по нему: по возрастанию
    // сверху оказываются худшие уровни, как и говорит спека.
    const pooled = rows.map((r, i) => ({
      ...r,
      supply: {
        ...r.supply!,
        rule: 'pool' as const,
        pool: { level: (i % 3) as 0 | 1 | 2, productionPercent: [100, 150, 250][i % 3] },
      },
    }));
    const sorted = sortRows(pooled, { column: 'supply', descending: false }, collator);
    const percents = sorted.map((r) => r.supply!.pool!.productionPercent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents[0]).toBe(100);
  });

  it('состав и числа строк не меняются — сортировка только переставляет', () => {
    const sorted = sortRows(rows, { column: 'interval', descending: true }, collator);
    expect(sorted).toHaveLength(rows.length);
    // тот же набор объектов, ничего не подменено и не пересчитано
    expect(new Set(sorted)).toEqual(new Set(rows));
    for (const row of rows) expect(sorted).toContain(row);
  });

  it('исходный массив не мутируется', () => {
    const before = [...rows];
    sortRows(rows, { column: 'cost', descending: true }, collator);
    expect(rows).toEqual(before);
  });
});

describe('цикл щелчков по заголовку', () => {
  it('возрастание → убывание → порядок поиска', () => {
    const first = nextSort(null, 'profit');
    expect(first).toEqual({ column: 'profit', descending: false });
    const second = nextSort(first, 'profit');
    expect(second).toEqual({ column: 'profit', descending: true });
    expect(nextSort(second, 'profit')).toBeNull();
  });

  it('щелчок по другой колонке начинает с возрастания', () => {
    const onProfit = { column: 'profit' as const, descending: true };
    expect(nextSort(onProfit, 'interval')).toEqual({ column: 'interval', descending: false });
  });
});
