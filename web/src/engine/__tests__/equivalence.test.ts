/**
 * Which rows of an answer the goal itself cannot tell apart from the best one.
 *
 * The distinction that matters here: `primary` orders a pair and is allowed to leave the
 * order undecided — the profit goal does, leaving profit to the shared tie-break — so a zero
 * from it is not equality. Each goal states its figure separately, and that is what equality
 * is read off.
 */
import { describe, expect, it } from 'vitest';
import { cargoByLabel, industriesMeta, industryById, trains, trainsMeta } from '../../dataset';
import { searchConsists, type OptimizeGoal, type OptimizeParams } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { holdsSupplied } from '../supply';
import type { SupplyTarget } from '../supply';

const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };

const chlorAlkaliPlant: SupplyTarget = {
  industry: industryById.get('chlor_alkali_plant')!,
  windowTicks: industriesMeta.supply_window_ticks,
  cargoRatio: 8,
  otherRatios: [],
};

/** Coal over level ground, a flow big enough that many consists have something to do. */
const task = {
  year: 1950,
  distanceTiles: 40,
  cargo: cargoByLabel.get('COAL')!,
  economyId: 'STEELTOWN',
  maxLengthTiles: 6,
  productionPerMonth: 900,
  maxTrains: 6,
  supplyTarget: chlorAlkaliPlant,
  game,
  calc: DEFAULT_CALC_SETTINGS,
};

const search = (goal: OptimizeGoal) =>
  searchConsists(trains, { ...task, goal } as OptimizeParams, trainsMeta, 20).rows;

describe('равноценность строк выдачи', () => {
  it('у цели «Прибыль» равна лучшей только она сама', () => {
    const rows = search('profit');
    expect(rows.length).toBeGreaterThan(5);
    // прибыль — почти непрерывная величина, совпадения по ней редки
    expect(rows.filter((r) => r.equivalentToBest)).toHaveLength(1);
    expect(rows[0].equivalentToBest).toBe(true);
  });

  it('у цели «Снабжение» равноценна вся верхушка', () => {
    const rows = search('supply');
    expect(rows.length).toBeGreaterThan(5);
    // конверсия считает прочие входы поданными и упирается в потолок — цель не различает
    expect(rows.every((r) => r.equivalentToBest)).toBe(true);
  });

  it('у цели «Вывоз» равноценных больше половины', () => {
    const rows = search('transported');
    const equal = rows.filter((r) => r.equivalentToBest).length;
    expect(equal).toBeGreaterThan(rows.length / 2);
  });

  it('признак читается по показателю цели, а не по её функции порядка', () => {
    // у «Прибыли» primary возвращает 0 при любых числах: если бы признак считался по нему,
    // равноценными оказались бы все строки
    const rows = search('profit');
    expect(rows.every((r) => r.equivalentToBest)).toBe(false);
  });

  it('равноценные строки действительно равны по показателю своей цели', () => {
    for (const goal of ['profit', 'transported', 'cheapest'] as const) {
      const rows = search(goal);
      const figure = (r: (typeof rows)[number]) =>
        goal === 'transported'
          ? Math.round(r.hauledPerYear)
          : goal === 'cheapest'
            ? Math.round(r.runningCostPerYear)
            : Math.round(r.profitPerYear);
      const best = figure(rows[0]);
      for (const row of rows) {
        expect(row.equivalentToBest, `${goal}: ${row.engine.id}`).toBe(figure(row) === best);
      }
    }
  });

  it('у цели «Прибыль» ничья бывает, и тогда равноценных ровно столько, сколько их есть', () => {
    // Ситуация из спеки: равноценных меньшинство. Короткая станция и короткое плечо — две
    // машины дают одну и ту же прибыль за год, остальные сорок восемь строк ниже.
    const rows = searchConsists(
      trains,
      {
        ...task,
        goal: 'profit',
        year: 1960,
        distanceTiles: 10,
        maxLengthTiles: 2,
        productionPerMonth: 0,
        maxTrains: 1,
      } as OptimizeParams,
      trainsMeta,
      50,
    ).rows;
    const equal = rows.filter((r) => r.equivalentToBest);
    expect(rows.length).toBeGreaterThan(10);
    expect(equal.length).toBe(2);
    expect(new Set(equal.map((r) => Math.round(r.profitPerYear))).size).toBe(1);
  });

  it('у цели «Снабжение» равноценность согласована с обеими частями показателя', () => {
    // Показатель этой цели — пара: конверсия и то, держит ли флот окно поставок. Вторая
    // часть на сегодняшних данных ни разу не различает строки (перебор по пяти приёмникам,
    // четырём дистанциям, трём размерам флота и трём выпускам не нашёл ответа, где при
    // равной конверсии удержание расходится), поэтому сторожа именно на неё построить не на
    // чем. Проверяем то, что проверить можно: признак согласован с обеими частями сразу.
    const rows = search('supply');
    const best = rows[0];
    for (const row of rows) {
      const same =
        row.supply?.conversion === best.supply?.conversion &&
        holdsSupplied(row.supply!.verdict) === holdsSupplied(best.supply!.verdict);
      expect(row.equivalentToBest, row.engine.id).toBe(same);
    }
  });
});
