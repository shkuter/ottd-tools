import { describe, expect, it } from 'vitest';
import { cargoByLabel, industriesMeta, industryById, supplyTargetFor, trains, trainsMeta } from '../../dataset';
import { optimizeConsists } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_FIRS_ECONOMY, DEFAULT_GAME_SETTINGS } from '../settings';
import { holdsSupplied } from '../supply';
import type { SupplyTarget } from '../supply';

const base = {
  year: 1938,
  cargo: cargoByLabel.get('COAL')!,
  economyId: 'STEELTOWN',
  allowElectric: false,
  maxLengthTiles: 6,
  game: DEFAULT_GAME_SETTINGS,
  calc: DEFAULT_CALC_SETTINGS,
};

/** Coke oven takes coal in Steeltown, and converts what it is fed. */
const cokeOven: SupplyTarget = {
  industry: industryById.get('coke_oven')!,
  windowTicks: industriesMeta.supply_window_ticks,
  cargoRatio: 8,
  otherRatios: [],
};

describe('цель «Снабжение»', () => {
  it('ранжирует по конверсии, а при равной конверсии — по прибыли', () => {
    const rows = optimizeConsists(
      trains,
      {
        ...base,
        distanceTiles: 300,
        productionPerMonth: 200,
        goal: 'supply',
        supplyTarget: cokeOven,
        maxTrains: 6,
      },
      trainsMeta,
      20,
    );
    expect(rows.length).toBeGreaterThan(1);
    // Лексикографика: конверсия не убывает сверху вниз, а внутри равной конверсии
    // выигрывает прибыль — цель ищет самый дешёвый способ добиться того же снабжения.
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].supply;
      const cur = rows[i].supply;
      expect(prev).not.toBeNull();
      expect(cur).not.toBeNull();
      const prevConversion = prev!.conversion ?? 0;
      const curConversion = cur!.conversion ?? 0;
      expect(prevConversion).toBeGreaterThanOrEqual(curConversion - 1e-9);
      if (Math.abs(prevConversion - curConversion) < 1e-9) {
        expect(Math.round(rows[i - 1].profitPerYear)).toBeGreaterThanOrEqual(
          Math.round(rows[i].profitPerYear),
        );
      }
    }
  });

  it('верхняя строка удерживает предприятие поданным, если это вообще достижимо', () => {
    const rows = optimizeConsists(
      trains,
      {
        ...base,
        distanceTiles: 120,
        productionPerMonth: 200,
        goal: 'supply',
        supplyTarget: cokeOven,
        maxTrains: 6,
      },
      trainsMeta,
      30,
    );
    const anyHolds = rows.some((r) => r.supply && holdsSupplied(r.supply.verdict));
    expect(anyHolds).toBe(true);
    expect(holdsSupplied(rows[0].supply!.verdict)).toBe(true);
  });

  it('чужие входы дают максимум конверсии — наверху всё равно удерживающие окно', () => {
    // «Любые три из пяти»: четыре чужих входа ratio 3 сами упираются в потолок 8, поэтому
    // конверсия у всех строк единица и различить их она не может.
    const applianceFactory = industryById.get('appliance_factory')!;
    const accepts = applianceFactory.economies[DEFAULT_FIRS_ECONOMY].accepts;
    const target: SupplyTarget = {
      industry: applianceFactory,
      windowTicks: industriesMeta.supply_window_ticks,
      cargoRatio: accepts.find((a) => a.label === 'STSH')!.ratio!,
      otherRatios: accepts.filter((a) => a.label !== 'STSH').map((a) => a.ratio ?? 0),
    };
    const rows = optimizeConsists(
      trains,
      {
        ...base,
        cargo: cargoByLabel.get('STSH')!,
        distanceTiles: 120,
        productionPerMonth: 200,
        goal: 'supply',
        supplyTarget: target,
        maxTrains: 3,
      },
      trainsMeta,
      20,
    );
    const conversions = new Set(rows.map((r) => r.supply?.conversion));
    expect(conversions).toEqual(new Set([1]));
    // ... и всё же строка, выпадающая из окна, не может стоять выше удерживающей
    const holds = rows.map((r) => (r.supply && holdsSupplied(r.supply.verdict) ? 1 : 0));
    const firstMiss = holds.indexOf(0);
    if (firstMiss !== -1) {
      expect(holds.slice(firstMiss).every((h) => h === 0)).toBe(true);
    }
    expect(holds[0]).toBe(1);
  });

  it('цель без получателя падает на прибыль, а не ранжирует ничем', () => {
    const params = {
      ...base,
      distanceTiles: 300,
      productionPerMonth: 200,
      maxTrains: 4,
    };
    const noTarget = optimizeConsists(
      trains,
      { ...params, goal: 'supply' as const, supplyTarget: null },
      trainsMeta,
      5,
    );
    const byProfit = optimizeConsists(
      trains,
      { ...params, goal: 'profit' as const },
      trainsMeta,
      5,
    );
    expect(noTarget.map((r) => r.engine.id)).toEqual(byProfit.map((r) => r.engine.id));
    expect(noTarget[0].supply).toBeNull();
  });

  it('без выпуска источника снабжение не оценивается: прочерк, а не благополучие', () => {
    const rows = optimizeConsists(
      trains,
      {
        ...base,
        distanceTiles: 300,
        productionPerMonth: 0,
        goal: 'supply',
        supplyTarget: cokeOven,
        maxTrains: 4,
      },
      trainsMeta,
      3,
    );
    for (const row of rows) {
      expect(row.supply?.ratio ?? null).toBeNull();
      expect(row.supply?.verdict).toBe('unknown');
    }
  });

  it('получатель с пулом: уровень в строке, а без выпуска — ничего', () => {
    const port = industryById.get('port')!;
    const target: SupplyTarget = {
      industry: port,
      windowTicks: industriesMeta.supply_window_ticks,
      cargoRatio: null,
      otherRatios: [],
    };
    const withFlow = optimizeConsists(
      trains,
      {
        ...base,
        distanceTiles: 120,
        productionPerMonth: 200,
        goal: 'supply',
        supplyTarget: target,
        maxTrains: 3,
      },
      trainsMeta,
      5,
    );
    expect(withFlow[0].supply?.rule).toBe('pool');
    expect(withFlow[0].supply?.pool).not.toBeNull();
    expect(withFlow[0].supply?.deliveredPerWindow).toBeGreaterThan(0);

    // Без выпуска объём неизвестен, и уровень не выдумывается из провозной способности парка
    const withoutFlow = optimizeConsists(
      trains,
      {
        ...base,
        distanceTiles: 120,
        productionPerMonth: 0,
        goal: 'supply',
        supplyTarget: target,
        maxTrains: 3,
      },
      trainsMeta,
      5,
    );
    for (const row of withoutFlow) {
      expect(row.supply?.pool ?? null).toBeNull();
      expect(row.supply?.deliveredPerWindow ?? null).toBeNull();
    }
  });

  it('ветка загрузки выбирается той же целью: снабжение не идёт в ущерб окну', () => {
    const rows = optimizeConsists(
      trains,
      {
        ...base,
        distanceTiles: 82,
        productionPerMonth: 30,
        goal: 'supply',
        supplyTarget: cokeOven,
        maxTrains: 4,
      },
      trainsMeta,
      5,
    );
    const differing = rows.find((r) => r.branchesDiffer);
    expect(differing).toBeDefined();
    // Ожидание удлиняет круг, поэтому под этой целью строка не может стоять в ветке
    // ожидания, когда ветка без ожидания даёт не худшую конверсию.
    if (differing?.waitForFullLoad) {
      expect(differing.supply?.conversion ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('получатель из данных', () => {
  const game = { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: DEFAULT_FIRS_ECONOMY };

  it('единственный потребитель подставляется сам', () => {
    const target = supplyTargetFor(game, 'COAL', '');
    expect(target).not.toBeNull();
    expect(target!.industry.economies[DEFAULT_FIRS_ECONOMY].accepts.map((a) => a.label)).toContain(
      'COAL',
    );
  });

  it('получатель, которого в экономике нет, заменяется, а не остаётся чужим', () => {
    const stale = supplyTargetFor(game, 'COAL', 'нет такого предприятия');
    expect(stale).not.toBeNull();
    expect(stale!.industry.economies[DEFAULT_FIRS_ECONOMY]).toBeDefined();
  });

  it('груз без потребителей не даёт цели вовсе', () => {
    expect(supplyTargetFor(game, 'НЕТ ТАКОГО ГРУЗА', '')).toBeNull();
  });

  it('остальные входы получателя приезжают вместе с выбранным грузом', () => {
    const target = supplyTargetFor(game, 'IORE', '')!;
    const accepts = target.industry.economies[DEFAULT_FIRS_ECONOMY].accepts;
    expect(target.cargoRatio).toBe(accepts.find((a) => a.label === 'IORE')?.ratio ?? null);
    expect(target.otherRatios).toHaveLength(accepts.length - 1);
  });
});
