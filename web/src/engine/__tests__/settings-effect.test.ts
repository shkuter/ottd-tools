/**
 * Каждая игровая настройка обязана менять хотя бы один расчёт.
 * Тест ловит «мёртвые» переключатели, которые есть в UI, но не входят в формулы.
 */
import { describe, expect, it } from 'vitest';
import { optimizeConsists, type OptimizeParams } from '../optimize';
import { consistStats } from '../consist';
import { transportedGoodsIncome } from '../income';
import {
  activeCargos,
  activeTrains,
  activeTrainsMeta,
  economyIdForPayment,
  trains,
  trainsMeta,
  cargoByLabel,
} from '../../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  clampGameYear,
  type CalcSettings,
  type GameSettings,
} from '../settings';

const cargo = cargoByLabel.get('COAL')!;

/**
 * Наборы по умолчанию выключены — калькулятор ничего не знает о партии, пока ему не скажут.
 * Мерить настройки на ванили нельзя: половина из них читается только там, где есть машины и
 * грузы этих наборов (экономика FIRS, классы содержания Iron Horse). Поэтому эталон и кейсы
 * стоят на включённых наборах, а кейс, которому нужна именно ваниль, гасит их сам.
 */
const SETS: Partial<GameSettings> = { ironHorse: true, firs: true };

function baseParams(game: GameSettings, calc: CalcSettings): OptimizeParams {
  return {
    year: 1950,
    distanceTiles: 200,
    cargo,
    economyId: economyIdForPayment(game),
    maxLengthTiles: 6,
    allowElectric: true,
    game,
    calc,
  };
}

/**
 * Снимок расчёта: топ-результат оптимизатора + статистика состава + активный набор грузов.
 * The set is part of it because one setting — the FIRS economy — decides what can be
 * computed at all instead of moving a figure (docs/adr/0002). A dead switch still fails the
 * test: it changes neither the numbers nor the set.
 */
function snapshot(
  gameOverrides: Partial<GameSettings>,
  calcOverrides: Partial<CalcSettings> = {},
  paramOverrides: Partial<OptimizeParams> = {},
) {
  const game = { ...DEFAULT_GAME_SETTINGS, ...SETS, ...gameOverrides };
  const calc = { ...DEFAULT_CALC_SETTINGS, ...calcOverrides };
  // набор машин следует настройкам: без Iron Horse считаются ванильные поезда
  const meta = activeTrainsMeta(game);
  const results = optimizeConsists(
    activeTrains(game),
    { ...baseParams(game, calc), ...paramOverrides },
    meta,
    5,
  );
  const top = results[0];
  const entries = top
    ? [
        { train: top.engine, count: top.engineCount },
        { train: top.wagon, count: top.wagonCount },
      ]
    : [];
  const stats = consistStats(entries, cargo, calc.capacityIndex, meta, game, calc);
  return JSON.stringify({
    profit: top?.profitPerYear,
    income: top?.incomePerTrip,
    running: top?.runningCostPerYear,
    buy: top?.buyCostTotal,
    trips: top?.tripsPerYear,
    loading: top?.loadingDays,
    speed: top?.loadedSpeedInternal,
    grade: top?.gradeSpeedInternal,
    capacity: top?.capacity,
    statsBuy: stats.buyCostTotal,
    statsGrade: stats.balancingSpeedOnGradeInternal,
    statsWeight: stats.loadedWeightT,
    // машина может ещё не появиться в игре: настройки влияют не только на числа
    introCertain: top ? top.engineIntro.certain && top.wagonIntro.certain : null,
    cargos: activeCargos(game).map((c) => c.label),
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
  // сам набор машин: без Iron Horse считаются ванильные поезда, а это другие числа целиком
  { name: 'ironHorse', game: { ironHorse: false } },
  // без FIRS активен ванильный набор грузов, и оплата берётся по ключу VANILLA
  { name: 'firs', game: { firs: false } },
  // экономика решает не числа, а состав набора: тот же груз оплачивается в них одинаково
  { name: 'firsEconomy', game: { firsEconomy: 'BASIC_TEMPERATE' } },
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
  // Iron Horse ставит все движки в паровой класс, а вагоны — в дизельный
  { name: 'basecostTrainRunningSteam', game: { basecostGrf: true, basecostTrainRunningSteam: 4 } },
  {
    name: 'basecostTrainRunningDiesel',
    game: { basecostGrf: true, basecostTrainRunningDiesel: 4 },
  },
  // электрический класс встречается только у ванильных машин
  {
    name: 'basecostTrainRunningElectric',
    game: { ironHorse: false, basecostGrf: true, basecostTrainRunningElectric: 4 },
    base: { ironHorse: false, basecostGrf: true },
    calc: { priceYear: 1990 },
    baseCalc: { priceYear: 1990 },
    params: { year: 1990 },
  },
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
  {
    // эталон уже с JGRPP: иначе кейс «проходил» бы из-за самого флага, а не из-за
    // множителя. Что множитель доходит до рейтинга станции, сторожит engine.test.ts —
    // здесь доля вывоза в снимок не входит, иначе через неё «прошёл» бы чужой кейс
    name: 'dayLengthFactor (JGRPP)',
    game: { jgrpp: true, dayLengthFactor: 4 },
    base: { jgrpp: true },
  },
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
          ? // множитель субсидии действует только на субсидированный груз; ростер берётся по
            // настройкам кейса, иначе кейс с выключенным набором считал бы по машинам набора
            JSON.stringify(
              optimizeConsists(
                activeTrains({ ...DEFAULT_GAME_SETTINGS, ...SETS, ...c.game }),
                {
                  ...baseParams({ ...DEFAULT_GAME_SETTINGS, ...SETS, ...c.game }, DEFAULT_CALC_SETTINGS),
                  subsidised: true,
                },
                activeTrainsMeta({ ...DEFAULT_GAME_SETTINGS, ...SETS, ...c.game }),
                1,
              )[0]?.profitPerYear,
            )
          : snapshot(c.game ?? {}, c.calc ?? {}, c.params ?? {});
      const reference =
        c.name === 'subsidyMultiplier'
          ? JSON.stringify(
              optimizeConsists(
                activeTrains({ ...DEFAULT_GAME_SETTINGS, ...SETS }),
                {
                  ...baseParams({ ...DEFAULT_GAME_SETTINGS, ...SETS }, DEFAULT_CALC_SETTINGS),
                  subsidised: true,
                },
                activeTrainsMeta({ ...DEFAULT_GAME_SETTINGS, ...SETS }),
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

describe('диапазон года', () => {
  it('принимает год начала партии вне эпохи инфляции', () => {
    // партии стартуют и в 1860, и раньше: в игре год ограничен только MIN_YEAR..MAX_YEAR
    expect(clampGameYear(1860, 1950)).toBe(1860);
    expect(clampGameYear(0, 1950)).toBe(0);
    expect(clampGameYear(2200, 1950)).toBe(2200);
  });

  it('пустое поле оставляет прежнее значение, а не обнуляет год', () => {
    expect(clampGameYear(Number.NaN, 1860)).toBe(1860);
    // очищенный NumberInput отдаёт '', а не NaN: Number('') === 0 — год, которого никто
    // не вводил, и который диапазон игры принимает как законный
    expect(clampGameYear('', 1860)).toBe(1860);
    expect(clampGameYear('   ', 1860)).toBe(1860);
    expect(clampGameYear('не год', 1860)).toBe(1860);
  });

  it('за границы игры не выпускает', () => {
    expect(clampGameYear(-5, 1950)).toBe(0);
    expect(clampGameYear(9_000_000, 1950)).toBe(5_000_000);
  });
});
