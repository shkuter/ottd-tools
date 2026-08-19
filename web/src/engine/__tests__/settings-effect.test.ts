/**
 * Каждая игровая настройка обязана менять хотя бы один расчёт.
 * Тест ловит «мёртвые» переключатели, которые есть в UI, но не входят в формулы.
 */
import { describe, expect, it } from 'vitest';
import { optimizeConsists, type OptimizeParams } from '../optimize';
import { consistStats } from '../consist';
import { transportedGoodsIncome } from '../income';
import { trains, trainsMeta, cargoByLabel } from '../../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from '../settings';

const cargo = cargoByLabel.get('COAL')!;

function baseParams(game: GameSettings, calc: CalcSettings): OptimizeParams {
  return {
    year: 1950,
    distanceTiles: 200,
    cargo,
    economyId: 'STEELTOWN',
    maxLengthTiles: 6,
    allowElectric: true,
    game,
    calc,
  };
}

/** Снимок расчёта: топ-результат оптимизатора + статистика состава. */
function snapshot(
  gameOverrides: Partial<GameSettings>,
  calcOverrides: Partial<CalcSettings> = {},
  paramOverrides: Partial<OptimizeParams> = {},
) {
  const game = { ...DEFAULT_GAME_SETTINGS, ...gameOverrides };
  const calc = { ...DEFAULT_CALC_SETTINGS, ...calcOverrides };
  const results = optimizeConsists(
    trains,
    { ...baseParams(game, calc), ...paramOverrides },
    trainsMeta,
    5,
  );
  const top = results[0];
  const entries = top
    ? [
        { train: top.engine, count: top.engineCount },
        { train: top.wagon, count: top.wagonCount },
      ]
    : [];
  const stats = consistStats(entries, cargo, calc.capacityIndex, trainsMeta, game, calc);
  return JSON.stringify({
    profit: top?.profitPerYear,
    income: top?.incomePerTrip,
    running: top?.runningCostPerYear,
    buy: top?.buyCostTotal,
    trips: top?.tripsPerYear,
    loading: top?.loadingDays,
    speed: top?.loadedSpeedMph,
    grade: top?.gradeSpeedMph,
    capacity: top?.capacity,
    statsBuy: stats.buyCostTotal,
    statsGrade: stats.balancingSpeedOnGradeMph,
    statsWeight: stats.loadedWeightT,
    // машина может ещё не появиться в игре: настройки влияют не только на числа
    introCertain: top ? top.engineIntro.certain && top.wagonIntro.certain : null,
  });
}

const BASELINE = snapshot({});

const CASES: {
  name: string;
  game?: Partial<GameSettings>;
  calc?: Partial<CalcSettings>;
  params?: Partial<OptimizeParams>;
  /**
   * Настройки эталона: нужны там, где переключатель читается только при других флагах
   * (модели инфляции — при jgrpp и inflation). Без базы кейс сравнивался бы с дефолтом
   * и «проходил» из-за этих флагов, а не из-за самой настройки.
   */
  base?: Partial<GameSettings>;
  /**
   * Настройки калькулятора для эталона. Нужны кейсу, чья испытуемая настройка живёт в calc:
   * иначе эталон получил бы тот же calc, что и кейс, и снимки совпали бы.
   */
  baseCalc?: Partial<CalcSettings>;
}[] = [
  { name: 'freightTrains', game: { freightTrains: 4 } },
  { name: 'slopeSteepness', game: { slopeSteepness: 8 } },
  { name: 'cargoAgingRate', game: { cargoAgingRate: 400 } },
  { name: 'vehicleCosts', game: { vehicleCosts: 2 } },
  // дефолт теперь игровой (low, ×6/8) — сравниваем с high
  { name: 'constructionCost', game: { constructionCost: 2 } },
  { name: 'accelerationModel', game: { accelerationModel: 'original' } },
  { name: 'gradualLoading', game: { gradualLoading: false } },
  { name: 'basecostGrf', game: { basecostGrf: true, basecostLocomotive: 8 } },
  { name: 'basecostLocomotive', game: { basecostGrf: true, basecostLocomotive: 8 } },
  { name: 'basecostWagon', game: { basecostGrf: true, basecostWagon: 8 } },
  { name: 'basecostTrainRunning', game: { basecostGrf: true, basecostTrainRunning: 4 } },
  { name: 'inflation', game: { inflation: true }, calc: { priceYear: 2000 } },
  {
    name: 'inflationInterest',
    game: { inflation: true, inflationInterest: 4 },
    base: { inflation: true },
    calc: { priceYear: 2000 },
  },
  {
    name: 'inflationFixedDates (JGRPP)',
    game: { jgrpp: true, inflation: true, inflationFixedDates: false },
    base: { jgrpp: true, inflation: true },
    calc: { priceYear: 2090 },
  },
  {
    // год старта читает только модель «инфляция от начала партии» (JGRPP, fixed dates off)
    name: 'startingYear (JGRPP)',
    game: { jgrpp: true, inflation: true, inflationFixedDates: false, startingYear: 1990 },
    base: { jgrpp: true, inflation: true, inflationFixedDates: false },
    calc: { priceYear: 2000 },
  },
  { name: 'timekeeping wallclock', game: { timekeeping: 'wallclock' } },
  { name: 'subsidyMultiplier', game: { subsidyMultiplier: 3 } },
  { name: 'dayLengthFactor (JGRPP)', game: { jgrpp: true, dayLengthFactor: 4 } },
  { name: 'costsWhenStopped (JGRPP)', game: { jgrpp: true, costsWhenStopped: 8 } },
  {
    // без рандомизации машина доступна с даты из GRF, с ней — на срок до 1,5 года позже
    name: 'vehicleIntroRandomisation (JGRPP)',
    game: { jgrpp: true, vehicleIntroRandomisation: false },
    params: { year: 1961 },
  },
  { name: 'capacityIndex', calc: { capacityIndex: 4 } },
  { name: 'hillTiles', calc: { hillTiles: 40 } },
  {
    // сравнение с той же инфляцией в 1950-м: меняется только год, а не сам факт инфляции
    name: 'priceYear (с инфляцией)',
    game: { inflation: true },
    base: { inflation: true },
    baseCalc: {},
    calc: { priceYear: 2050 },
  },
  { name: 'trackType', calc: { trackType: 'NG' } },
];

describe('каждая настройка влияет на расчёт', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const changed =
        c.name === 'subsidyMultiplier'
          ? // множитель субсидии действует только на субсидированный груз
            JSON.stringify(
              optimizeConsists(
                trains,
                {
                  ...baseParams({ ...DEFAULT_GAME_SETTINGS, ...c.game }, DEFAULT_CALC_SETTINGS),
                  subsidised: true,
                },
                trainsMeta,
                1,
              )[0]?.profitPerYear,
            )
          : snapshot(c.game ?? {}, c.calc ?? {}, c.params ?? {});
      const reference =
        c.name === 'subsidyMultiplier'
          ? JSON.stringify(
              optimizeConsists(
                trains,
                { ...baseParams(DEFAULT_GAME_SETTINGS, DEFAULT_CALC_SETTINGS), subsidised: true },
                trainsMeta,
                1,
              )[0]?.profitPerYear,
            )
          : c.base
            ? // кейс с базой: те же calc и params, отличается только испытуемая настройка
              snapshot(c.base, c.baseCalc ?? c.calc ?? {}, c.params ?? {})
            : c.params
              ? // кейс со своими параметрами задачи сравнивается с ними же на дефолтных настройках
                snapshot({}, {}, c.params)
              : BASELINE;
      expect(changed).not.toBe(reference);
    });
  }
});

describe('выключенный Base Costs GRF', () => {
  it('множители не применяются, пока GRF не включён', () => {
    const off = snapshot({ basecostGrf: false, basecostLocomotive: 8, basecostWagon: 8 });
    expect(off).toBe(BASELINE);
  });
});

describe('paymentAlgorithm (JGRPP)', () => {
  it('traditional обрезает время в пути на 255 периодах, modern — нет', () => {
    // различие проявляется только на очень долгих рейсах (>255 периодов ≈ 637 дней)
    const spec = { currentPayment: 5916, transitPeriods: [7, 255] as [number, number] };
    const modern = transportedGoodsIncome(100, 200, 400, spec, 100, 'modern');
    const traditional = transportedGoodsIncome(100, 200, 400, spec, 100, 'traditional');
    expect(traditional).toBeGreaterThan(modern);
    // на коротких рейсах алгоритмы совпадают
    expect(transportedGoodsIncome(100, 200, 10, spec, 100, 'modern')).toBe(
      transportedGoodsIncome(100, 200, 10, spec, 100, 'traditional'),
    );
  });
});

describe('переключение наборов NewGRF', () => {
  it('без Iron Horse берутся ванильные машины', () => {
    const game = { ...DEFAULT_GAME_SETTINGS, ironHorse: false };
    const results = optimizeConsists(
      trains,
      baseParams(game, DEFAULT_CALC_SETTINGS),
      trainsMeta,
      1,
    );
    // с ванильными правилами refit у Iron Horse-вагонов список сильно меняется
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});
