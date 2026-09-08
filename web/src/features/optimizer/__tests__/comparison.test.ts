/**
 * Сравнение отмеченных машин: колонки считаются тем же поиском, что и таблица, поэтому при
 * совпадении условий совпадают и числа. Здесь проверяются данные панели, а не её вид.
 */
import { describe, expect, it } from 'vitest';
import { cargoByLabel, industriesMeta, industryById, trains, trainsMeta } from '../../../dataset';
import { optimizeConsists, type OptimizeParams, type OptimizeResult } from '../../../engine/optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import type { SupplyTarget } from '../../../engine/supply';
import { taskKeyOf } from '../useComparison';
import {
  comparisonColumns,
  comparisonMetrics,
  pickOf,
  sharedWagon,
  type ComparisonPick,
} from '../comparison';

// Steeltown и ростер Iron Horse: наборы по умолчанию выключены, здесь они нужны
const GAME = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };

/** Уголь на 120 клеток при 900 т/мес — задача, где встречаются обе машины из вопроса партии. */
const COAL_HAUL = {
  year: 1938,
  distanceTiles: 120,
  cargo: cargoByLabel.get('COAL')!,
  economyId: 'STEELTOWN',
  maxLengthTiles: 6,
  productionPerMonth: 900,
  maxTrains: 4,
  game: GAME,
  calc: DEFAULT_CALC_SETTINGS,
} satisfies OptimizeParams;

const search = (params: OptimizeParams = COAL_HAUL) =>
  optimizeConsists(trains, params, trainsMeta, 60);

const rowOf = (rows: readonly OptimizeResult[], id: string) => {
  const row = rows.find((r) => r.engine.id === id);
  expect(row, `в выдаче нет машины ${id}`).toBeDefined();
  return row!;
};

const columnsFor = (ids: readonly string[], params: OptimizeParams = COAL_HAUL) => {
  const rows = search(params);
  const picks = ids.map((id) => pickOf(rowOf(rows, id)));
  const { wagon, columns } = comparisonColumns(picks, rows, trains, params, trainsMeta);
  return { rows, picks, wagon, columns };
};

describe('колонки сравнения', () => {
  it('уравнивают тип вагона по первой отмеченной строке', () => {
    const { rows, columns } = columnsFor(['haar', 'mainstay']);
    const wagon = sharedWagon([pickOf(rowOf(rows, 'haar'))], rows);
    expect(wagon).not.toBeNull();
    expect(columns).toHaveLength(2);
    expect(columns.every((c) => c.row?.wagon.id === wagon!.id)).toBe(true);
    // У второй машины в её собственной строке вагон был другой — сравнение его заменило.
    expect(rowOf(rows, 'mainstay').wagon.id).not.toBe(wagon!.id);
  });

  it('берут вагон у первой отметки, которая ещё есть в выдаче', () => {
    const { rows } = columnsFor(['haar', 'mainstay']);
    const gone: ComparisonPick = { engineId: 'no-such-engine', engineCount: 1 };
    // Строки пересобираются при смене цели, и отметка может пережить свою строку: вагон тогда
    // берёт следующая живая, а не пропадает вместе с панелью.
    expect(sharedWagon([gone, pickOf(rowOf(rows, 'mainstay'))], rows)?.id).toBe(
      rowOf(rows, 'mainstay').wagon.id,
    );
    expect(sharedWagon([gone], rows)).toBeNull();
  });

  it('не выпускают состав за длину станции', () => {
    const { columns } = columnsFor(['haar', 'mainstay']);
    expect(columns.every((c) => (c.row?.lengthTiles ?? 0) <= COAL_HAUL.maxLengthTiles)).toBe(true);
  });

  it('повторяют числа строки выдачи, когда вагон и так был общий', () => {
    const { rows, columns } = columnsFor(['haar', 'mainstay']);
    const haar = rowOf(rows, 'haar');
    const column = columns[0]!.row!;
    // Вагон общий взят у самой haar, поэтому её колонка обязана совпасть со строкой.
    expect(column.wagon.id).toBe(haar.wagon.id);
    expect(column.wagonCount).toBe(haar.wagonCount);
    expect(column.fleetSize).toBe(haar.fleetSize);
    expect(Math.round(column.runningCostPerYear)).toBe(Math.round(haar.runningCostPerYear));
    expect(Math.round(column.hauledPerYear)).toBe(Math.round(haar.hauledPerYear));
    expect(Math.round(column.profitPerYear)).toBe(Math.round(haar.profitPerYear));
    // Спека требует совпадения «включая ветку загрузки, рейтинг станции, вывоз и деньги».
    expect(column.waitForFullLoad).toBe(haar.waitForFullLoad);
    expect(column.stationRating?.deliveredShare).toBe(haar.stationRating?.deliveredShare);
    expect(Math.round(column.buyCostTotal)).toBe(Math.round(haar.buyCostTotal));
    expect(Math.round(column.roundTripDays)).toBe(Math.round(haar.roundTripDays));
  });

  it('пересобирают связку второй машины под общий вагон', () => {
    const { rows, columns } = columnsFor(['haar', 'mainstay']);
    const own = rowOf(rows, 'mainstay');
    const column = columns[1]!.row!;
    // Строка выдачи и колонка — разные связки: вагон общий, поэтому и число вагонов другое.
    expect(column.wagon.id).not.toBe(own.wagon.id);
    expect(column.wagonCount).not.toBe(own.wagonCount);
    // Парк выбран заново под этот вагон, а не перенесён из строки: он равен тому, что даёт
    // поиск по этой паре.
    const alone = optimizeConsists([column.engine, column.wagon], COAL_HAUL, trainsMeta, 2).find(
      (r) => r.engineCount === column.engineCount,
    );
    expect(column.fleetSize).toBe(alone!.fleetSize);
  });

  it('держат отмеченную секционность', () => {
    const rows = search();
    const doubled = rows.find((r) => r.engineCount === 2);
    expect(doubled, 'на этой задаче нет двухсекционных ответов — кейс перестал проверять своё')
      .toBeDefined();
    const { columns } = comparisonColumns([pickOf(doubled!)], rows, trains, COAL_HAUL, trainsMeta);
    expect(columns[0]!.engineCount).toBe(2);
    expect(columns[0]!.row?.engineCount).toBe(2);
  });

  it('следуют за целью поиска так же, как выдача', () => {
    const { picks, rows } = columnsFor(['haar', 'mainstay']);
    const under = (goal: OptimizeParams['goal']) =>
      comparisonColumns(picks, rows, trains, { ...COAL_HAUL, goal }, trainsMeta).columns;
    const shape = (columns: ReturnType<typeof comparisonColumns>['columns']) =>
      columns.map((c) => (c.row ? [c.row.wagonCount, c.row.fleetSize, c.row.waitForFullLoad] : null));

    // Цель выбирает длину состава, парк и ветку загрузки — колонки обязаны это отражать, а не
    // держать один и тот же ответ при любой цели.
    expect(shape(under('transported'))).not.toEqual(shape(under('profit')));
    // Каждая колонка равна тому, что дал бы поиск по этой паре под той же целью.
    for (const goal of ['profit', 'transported'] as const) {
      const columns = under(goal);
      for (const column of columns) {
        const alone = optimizeConsists(
          [column.engine, column.row!.wagon],
          { ...COAL_HAUL, goal },
          trainsMeta,
          2,
        ).find((r) => r.engineCount === column.engineCount);
        expect(Math.round(column.row!.profitPerYear)).toBe(Math.round(alone!.profitPerYear));
      }
    }
  });
});

describe('колонка без ответа', () => {
  it('остаётся на месте и называет условия, отвергшие варианты', () => {
    const heavy = { ...COAL_HAUL, year: 1870, maxLengthTiles: 7, productionPerMonth: 4000 };
    const rows = optimizeConsists(trains, heavy, trainsMeta, 60);
    const picks = rows.slice(0, 3).map(pickOf);
    const cheapest = { ...heavy, goal: 'cheapest' as const } satisfies OptimizeParams;
    const { columns } = comparisonColumns(picks, rows, trains, cheapest, trainsMeta);
    expect(columns).toHaveLength(3);
    expect(columns.every((c) => c.row === null)).toBe(true);
    // Причина — из того же поиска: цели «Мин. расходы» этих вариантов мало.
    expect(columns.every((c) => c.refused.length > 0)).toBe(true);
  });

  it('остаётся на месте и без причины, когда перебор не дал ничего', () => {
    // Станция короче самой машины — ввода такой длины интерфейс не даёт, но функция обязана
    // вернуть колонку без строки, а не упасть: перебор в этом случае не выдаёт ни одного
    // варианта и отвергать ему нечего.
    const rows = search();
    const picks = [pickOf(rowOf(rows, 'haar'))];
    const tiny = { ...COAL_HAUL, maxLengthTiles: 0.4 } satisfies OptimizeParams;
    const { columns } = comparisonColumns(picks, rows, trains, tiny, trainsMeta);
    expect(columns).toHaveLength(1);
    expect(columns[0]!.row).toBeNull();
    expect(columns[0]!.refused).toHaveLength(0);
  });
});

/** Кокосовая печь — получатель с конверсией; шахта — с пулом, и показывается иначе. */
const target = (id: string, cargoRatio: number | null = 8): SupplyTarget => ({
  industry: industryById.get(id)!,
  windowTicks: industriesMeta.supply_window_ticks,
  cargoRatio,
  otherRatios: [],
});

describe('показатели панели', () => {
  const metricsFor = (params: OptimizeParams, supplyTarget: SupplyTarget | null = null) => {
    const { columns } = columnsFor(['haar', 'mainstay'], params);
    return comparisonMetrics(columns, {
      productionPerMonth: params.productionPerMonth ?? 0,
      supplyTarget,
    });
  };
  const byKey = (metrics: ReturnType<typeof comparisonMetrics>, key: string) => {
    const metric = metrics.find((m) => m.key === key);
    expect(metric, `нет показателя ${key}`).toBeDefined();
    return metric!;
  };

  it('идут в объявленном порядке и не отмечают лучшее у описательных строк', () => {
    const metrics = metricsFor(COAL_HAUL);
    expect(metrics.map((m) => m.id)).toEqual([
      'tractiveEffort',
      'speedFlat',
      'speedGrade',
      'capacity',
      'length',
      'wagons',
      'fleet',
      'roundTrip',
      'hauled',
      'rating',
      'running',
      'buy',
      'profit',
      'payback',
      'costPerUnit',
    ]);
    // Длина, число вагонов и парк ничего не говорят о том, лучше машина или хуже.
    for (const id of ['length', 'wagons', 'fleet'] as const) {
      const metric = metrics.find((m) => m.id === id);
      expect(metric, `нет показателя ${id}`).toBeDefined();
      expect(metric!.direction).toBe('none');
      expect(metric!.best.some(Boolean)).toBe(false);
    }
  });

  it('знают, куда «лучше» у каждого показателя', () => {
    // Направление — обещание спеки по каждому показателю поимённо: у денег, времени и
    // окупаемости лучше меньшее, у тяги, скоростей и вывоза — большее, а у описательных
    // строк лучшего не бывает. Проверяется таблицей целиком: поодиночке эти обещания
    // молчаливо разъезжались с кодом.
    const directions = Object.fromEntries(
      metricsFor(COAL_HAUL).map((m) => [m.id, m.direction]),
    );
    expect(directions).toEqual({
      tractiveEffort: 'up',
      speedFlat: 'up',
      speedGrade: 'up',
      capacity: 'up',
      length: 'none',
      wagons: 'none',
      fleet: 'none',
      roundTrip: 'down',
      hauled: 'up',
      rating: 'up',
      running: 'down',
      buy: 'down',
      profit: 'up',
      payback: 'down',
      costPerUnit: 'down',
    });
  });

  it('отмечают лучшее с учётом направления показателя', () => {
    const metrics = metricsFor(COAL_HAUL);
    const running = byKey(metrics, 'table.running');
    const effort = byKey(metrics, 'consist.stats.maxTe');
    const cheaper = running.values.indexOf(Math.min(...(running.values as number[])));
    const stronger = effort.values.indexOf(Math.max(...(effort.values as number[])));
    expect(running.best[cheaper]).toBe(true);
    expect(effort.best[stronger]).toBe(true);
    // Показатели тянут в разные стороны: победителя целиком панель не называет.
    expect(cheaper).not.toBe(stronger);
  });

  it('не отмечают лучшим того, у кого значения нет', () => {
    const { columns } = columnsFor(['haar', 'mainstay']);
    // Вторая машина без ответа: её пустая клетка не должна победить в строках, где «лучше» —
    // меньшее, иначе отсутствие ответа читалось бы как ноль.
    const withGap = [columns[0]!, { ...columns[1]!, row: null }];
    const metrics = comparisonMetrics(withGap, { productionPerMonth: 900, supplyTarget: null });
    for (const metric of metrics.filter((m) => m.direction !== 'none')) {
      expect(metric.values[1], `у второй колонки взялось значение ${metric.id}`).toBeNull();
      expect(metric.best[1], `пустая клетка отмечена лучшей в ${metric.id}`).toBe(false);
      expect(metric.best[0]).toBe(metric.values[0] !== null);
    }
  });

  it('при ничьей отмечают всех', () => {
    const metrics = metricsFor(COAL_HAUL);
    const speed = byKey(metrics, 'consist.stats.balancing');
    expect(speed.values[0]).toBe(speed.values[1]);
    expect(speed.best).toEqual([true, true]);
  });

  it('оставляют стоимость единицы пустой без заданного выпуска', () => {
    const withFlow = byKey(metricsFor(COAL_HAUL), 'compare.costPerUnit');
    expect(withFlow.values.every((v) => v !== null)).toBe(true);

    // Без выпуска годовой вывоз — провозная способность, а не доставленное: делить на неё
    // значит показать не тот показатель, поэтому строка пуста, хотя вывоз положителен.
    const noFlow = { ...COAL_HAUL, productionPerMonth: 0 } satisfies OptimizeParams;
    const metrics = metricsFor(noFlow);
    expect(byKey(metrics, 'opt.hauled').values.every((v) => (v ?? 0) > 0)).toBe(true);
    expect(byKey(metrics, 'compare.costPerUnit').values.every((v) => v === null)).toBe(true);
  });

  it('не показывают окно поставок, когда вердикта нет ни у кого', () => {
    const coke = target('coke_oven');
    // Получатель задан и вердикт у его правила бывает, но без выпуска источника интервала нет
    // — значение пусто у всех, и строка не нужна.
    const noFlow = { ...COAL_HAUL, productionPerMonth: 0, supplyTarget: coke } satisfies OptimizeParams;
    expect(metricsFor(noFlow, coke).some((m) => m.key === 'opt.supply')).toBe(false);
  });

  it('ставят строку снабжения между рейтингом и деньгами', () => {
    const coke = target('coke_oven');
    const withTarget = { ...COAL_HAUL, supplyTarget: coke };
    const ids = metricsFor(withTarget, coke).map((m) => m.id);
    // Место строки — часть профиля: снабжение читается сразу за рейтингом станции, до денег.
    expect(ids.indexOf('supply')).toBe(ids.indexOf('rating') + 1);
    expect(ids.indexOf('supply')).toBeLessThan(ids.indexOf('running'));
  });

  it('оставляют строку снабжения, если вердикт есть хотя бы у одной машины', () => {
    const coke = target('coke_oven');
    const { columns } = columnsFor(['haar', 'mainstay'], { ...COAL_HAUL, supplyTarget: coke });
    // Вторая машина без ответа: строка всё равно нужна — по первой вердикт есть.
    const withGap = [columns[0]!, { ...columns[1]!, row: null }];
    const metrics = comparisonMetrics(withGap, { productionPerMonth: 900, supplyTarget: coke });
    const supply = metrics.find((m) => m.id === 'supply');
    expect(supply, 'строка снабжения пропала из-за колонки без ответа').toBeDefined();
    expect(supply!.values[0]).not.toBeNull();
    expect(supply!.values[1]).toBeNull();
  });

  it('показывают окно поставок только при вердикте по получателю', () => {
    const coke = target('coke_oven');
    const store = target('general_store', null);
    const withTarget = { ...COAL_HAUL, supplyTarget: coke } satisfies OptimizeParams;
    expect(metricsFor(withTarget, coke).some((m) => m.key === 'opt.supply')).toBe(true);
    expect(metricsFor(COAL_HAUL, null).some((m) => m.key === 'opt.supply')).toBe(false);
    // У предприятия без вердикта строка тоже не нужна: прочерк в каждой колонке ничего не
    // сообщает.
    expect(metricsFor(COAL_HAUL, store).some((m) => m.key === 'opt.supply')).toBe(false);
  });
});

describe('ключ задачи', () => {
  const key = (over: Partial<OptimizeParams> = {}) => taskKeyOf({ ...COAL_HAUL, ...over });

  it('меняется от всего, от чего пересобирается выдача', () => {
    const cases: Partial<OptimizeParams>[] = [
      { year: 1960 },
      { distanceTiles: 260 },
      { maxLengthTiles: 4 },
      { productionPerMonth: 300 },
      { maxTrains: 2 },
      { subsidised: true },
      { excludedIds: ['haar'] },
      { cargo: cargoByLabel.get('STEL')! },
      { calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'ELRL' } },
      { calc: { ...DEFAULT_CALC_SETTINGS, hillTiles: 6 } },
      { game: { ...GAME, dayLengthFactor: 8 } },
    ];
    for (const over of cases) {
      expect(key(over), `ключ не заметил ${Object.keys(over)[0]}`).not.toBe(key());
    }
    // Набор машин, которые продаёт импортированная партия, тоже меняет ответ.
    expect(key({ soldIds: new Set(['haar']) })).not.toBe(key());
    expect(key({ soldIds: new Set(['haar']) })).not.toBe(key({ soldIds: new Set(['mainstay']) }));
  });

  it('не меняется от цели: задача та же', () => {
    expect(key({ goal: 'cheapest' })).toBe(key({ goal: 'profit' }));
  });
});

describe('снабжение получателя с пулом', () => {
  it('показывается прибавкой к выпуску, где больше — лучше', () => {
    // Шахта копит поставки в пул: колонка выдачи рисует прибавку к выпуску в процентах, и
    // панель обязана называть то же число тем же способом.
    const supplies = {
      year: 1938,
      distanceTiles: 60,
      cargo: cargoByLabel.get('ENSP')!,
      economyId: 'STEELTOWN',
      maxLengthTiles: 6,
      productionPerMonth: 120,
      maxTrains: 4,
      supplyTarget: target('coal_mine', null),
      game: GAME,
      calc: DEFAULT_CALC_SETTINGS,
    } satisfies OptimizeParams;
    const rows = optimizeConsists(trains, supplies, trainsMeta, 20);
    expect(rows.length).toBeGreaterThan(1);
    const { columns } = comparisonColumns(rows.slice(0, 2).map(pickOf), rows, trains, supplies, trainsMeta);
    const metrics = comparisonMetrics(columns, {
      productionPerMonth: supplies.productionPerMonth,
      supplyTarget: supplies.supplyTarget,
    });
    const supply = metrics.find((m) => m.id === 'supply');
    expect(supply, 'строка снабжения не появилась').toBeDefined();
    expect(supply!.kind).toBe('supplyBonus');
    expect(supply!.direction).toBe('up');
  });
});

describe('вопрос из партии: haar против mainstay', () => {
  it('разводит машины по разным показателям, не называя победителя', () => {
    const { columns } = columnsFor(['haar', 'mainstay']);
    const [haar, mainstay] = columns.map((c) => c.row!);
    // Обе упираются в один и тот же поток, поэтому вывоз равный — разница в другом.
    expect(Math.round(haar.hauledPerYear)).toBe(Math.round(mainstay.hauledPerYear));
    // Mainstay сильнее: тяга и скорость на уклоне выше.
    expect(mainstay.tractiveEffortN).toBeGreaterThan(haar.tractiveEffortN);
    expect(mainstay.gradeSpeedInternal).toBeGreaterThan(haar.gradeSpeedInternal);
    // Haar дешевле: содержание, цена и стоимость единицы доставленного.
    expect(haar.runningCostPerYear).toBeLessThan(mainstay.runningCostPerYear);
    expect(haar.buyCostTotal).toBeLessThan(mainstay.buyCostTotal);
    expect(haar.runningCostPerYear / haar.hauledPerYear).toBeLessThan(
      mainstay.runningCostPerYear / mainstay.hauledPerYear,
    );
  });
});
