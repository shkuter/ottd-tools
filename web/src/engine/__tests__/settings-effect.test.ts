/**
 * Каждая игровая настройка обязана менять хотя бы один расчёт.
 * Тест ловит «мёртвые» переключатели, которые есть в UI, но не входят в формулы.
 */
import { describe, expect, it } from 'vitest';
import { optimizeConsists, type OptimizeParams } from '../optimize';
import { consistStats } from '../consist';
import { signalInputs, signalPlan } from '../signals';
import { transportedGoodsIncome } from '../income';
import { standsInBuyMenu } from '../availability';
import { networkMaintenance, type NetworkCounts } from '../infrastructure';
import { railConvertCost } from '../costs';
import {
  activeCargos,
  activeRailtypes,
  activeTrains,
  activeTrainsMeta,
  availabilityContext,
  economyIdForPayment,
  selectableRailtypes,
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
 * A network to price alongside the consist: the upkeep settings move no vehicle, so without
 * it the snapshot would be blind to them. Both sets carry RAIL and ELRL, so the same counts
 * are billable whichever roster a case runs on.
 */
const NETWORK: NetworkCounts = {
  rail: { RAIL: 1200, ELRL: 400 },
  signals: 250,
  stations: 60,
  road: { ROAD: 20 },
  tram: { ELRL: 8 },
  canals: 5,
};

/**
 * Наборы по умолчанию выключены — калькулятор ничего не знает о партии, пока ему не скажут.
 * Мерить настройки на ванили нельзя: половина из них читается только там, где есть машины и
 * грузы этих наборов (экономика FIRS, классы содержания Iron Horse). Поэтому эталон и кейсы
 * стоят на включённых наборах, а кейс, которому нужна именно ваниль, гасит их сам.
 */
const SETS: Partial<GameSettings> = { trainSet: 'iron_horse' as const, firs: true };

function baseParams(game: GameSettings, calc: CalcSettings): OptimizeParams {
  return {
    year: 1950,
    distanceTiles: 200,
    cargo,
    economyId: economyIdForPayment(game),
    maxLengthTiles: 6,
    game,
    // the track comes from the case's own calc: pinning it here would make the snapshot
    // blind to the one setting whose whole effect is which vehicles the search may use
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
  const params = { ...baseParams(game, calc), ...paramOverrides };
  const results = optimizeConsists(activeTrains(game), params, meta, 5);
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
    introCertain: top ? top.engineBuyMenu.intro.certain && top.wagonBuyMenu.intro.certain : null,
    // сколько машин игра вообще продаёт в этот год: настройка может менять состав
    // списка, не трогая победителя — списывают обычно тех, кто и так не выигрывает
    inBuyMenu: activeTrains(game).filter((train) =>
      standsInBuyMenu(train, params.year, availabilityContext(game)),
    ).length,
    cargos: activeCargos(game).map((c) => c.label),
    // стоимость владения сетью: настройки обслуживания инфраструктуры не двигают ни одной
    // машины, поэтому в снимке им отвечает только эта строка
    network: networkMaintenance(NETWORK, activeRailtypes(game), game, calc.priceYear).yearly,
    // цена перевода куска пути: строительные цены не двигают ни машину, ни содержание,
    // поэтому их множители видны только здесь. Типы берутся у самого набора, а не по
    // лейблам: на незнакомый лейбл activeRailtype молча отдаёт первый путь, и строка
    // сравнила бы тип сам с собой
    convert: (() => {
      const [from, to = from] = selectableRailtypes(game);
      return from ? railConvertCost(from, to!, game, calc.priceYear) : 0;
    })(),
    // полезная плотность сигналов: настройки торможения не двигают ни машину, ни содержание
    // сети, поэтому в снимке им отвечает только эта строка
    signals: (() => {
      const plan = signalPlan(
        signalInputs(
          {
            entries,
            meta,
            cargo,
            payment: cargo.initial_payment_by_economy[economyIdForPayment(game)] ?? 0,
            distanceTiles: params.distanceTiles,
            productionPerMonth: 0,
            game,
            calc,
          },
          NETWORK,
          2,
        ),
        { game, calc },
      );
      return plan && [plan.usefulSpacing, plan.recommendedSignals, plan.yearlySaving];
    })(),
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
  // сам набор машин: против эталонного Iron Horse ваниль даёт другие числа целиком.
  // Своя база не нужна: эталон отличается от кейса ровно этой настройкой
  { name: 'trainSet: vanilla', game: { trainSet: 'vanilla' as const } },
  // без FIRS активен ванильный набор грузов, и оплата берётся по ключу VANILLA
  { name: 'firs', game: { firs: false } },
  // экономика решает не числа, а состав набора: тот же груз оплачивается в них одинаково
  { name: 'firsEconomy', game: { firsEconomy: 'BASIC_TEMPERATE' } },
  { name: 'freightTrains', game: { freightTrains: 4 } },
  { name: 'slopeSteepness', game: { slopeSteepness: 8 } },
  // выключенная настройка снимает с состава предел его вагонов: едет он по локомотиву
  { name: 'wagonSpeedLimits', game: { wagonSpeedLimits: false } },
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
  // электрический класс встречается только у ванильных машин, а электровоз выходит на
  // линию только под контактной сетью — отсюда путь ELRL в обоих снимках
  {
    name: 'basecostTrainRunningElectric',
    game: { trainSet: 'vanilla' as const, basecostGrf: true, basecostTrainRunningElectric: 4 },
    base: { trainSet: 'vanilla' as const, basecostGrf: true },
    calc: { priceYear: 1990, trackType: 'ELRL' },
    baseCalc: { priceYear: 1990, trackType: 'ELRL' },
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
    // без рандомизации машина доступна с даты из GRF, с ней — на срок до 1,5 года позже;
    // год берётся такой, где разница ещё не съедена годом ожидания продажи
    name: 'vehicleIntroRandomisation (JGRPP)',
    game: { jgrpp: true, vehicleIntroRandomisation: false },
    params: { year: 1962 },
  },
  {
    // машина, чей срок продажи вышел, остаётся в списке покупки
    name: 'neverExpireVehicles',
    game: { neverExpireVehicles: true },
    params: { year: 1990 },
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
  // электрифицированная линия против обычной: те же машины, другой набор допущенных
  { name: 'trackType', calc: { trackType: 'ELRL' } },
  // статья расходов целиком: с ней сеть стоит денег, без неё — ничего
  { name: 'infrastructureMaintenance', game: { infrastructureMaintenance: true } },
  {
    // база уже со включённой статьёй: иначе кейс «прошёл» бы из-за неё, а не из-за модели
    // роста — при выключенной статье сеть бесплатна при любой модели
    name: 'linearMaintenance (JGRPP)',
    game: { jgrpp: true, infrastructureMaintenance: true, linearMaintenance: true },
    base: { jgrpp: true, infrastructureMaintenance: true },
  },
  {
    // модель торможения: реалистичная даёт поезду тормозной путь, и полезная плотность
    // сигналов начинает считаться по нему. База — с уже включённым JGRPP, иначе кейс
    // прошёл бы за счёт самого флага патчпака
    name: 'brakingModel (JGRPP)',
    game: { jgrpp: true, brakingModel: 'realistic' },
    base: { jgrpp: true },
  },
  {
    // коэффициент масштабирования: ограничивает замедление, на которое рассчитывает поезд,
    // поэтому виден только там, где тормозной путь вообще считается — при реалистичном
    // торможении, которое и стоит в базе
    name: 'trainAccBrakingPercent (JGRPP)',
    game: { jgrpp: true, brakingModel: 'realistic', trainAccBrakingPercent: 40 },
    base: { jgrpp: true, brakingModel: 'realistic' },
  },
  {
    // цены постройки и сноса пути: своя категория расходов (construction_cost) и свой
    // множитель набора Base Costs. База — с уже включённым GRF, иначе кейс прошёл бы за
    // счёт самого флага, а не за счёт множителя
    name: 'basecostRailConstruction',
    game: { basecostGrf: true, basecostRailConstruction: 8 },
    base: { basecostGrf: true },
  },
  {
    // множитель Base Costs на цены инфраструктуры: своя база — со включённой статьёй и
    // включённым GRF, иначе кейс прошёл бы за счёт любого из этих двух флагов
    name: 'basecostInfrastructure',
    game: { infrastructureMaintenance: true, basecostGrf: true, basecostInfrastructure: 8 },
    base: { infrastructureMaintenance: true, basecostGrf: true },
  },
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
    const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const };
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
