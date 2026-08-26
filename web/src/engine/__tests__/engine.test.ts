import { describe, expect, it } from 'vitest';
import { cargoPaymentRate, incomeCurve, timeFactor, transportedGoodsIncome } from '../income';
import { inflationFactors } from '../inflation';
import {
  buyCost,
  consistMoney,
  price,
  runningCostPerYear,
  trainBuyCost,
  trainRunningCostPerYear,
} from '../costs';
import { balancingSpeed, forceN, maxTractiveEffortN, resistanceN } from '../physics';
import {
  daysForDistance,
  internalToKmh,
  internalToMph,
  mphToInternal,
  tilesPerDay,
  transitPeriodsFromDays,
} from '../units';
import { optimizeConsists } from '../optimize';
import { createOptimizerCache } from '../optimizeCache';
import { estimateStationRating, ratingPeriods, speedRating } from '../rating';
import { tripEconomics } from '../trip';
import {
  activeTrains,
  activeTrainsMeta,
  trains,
  trainsMeta,
  cargoByLabel,
} from '../../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  daysPerEconomyYear,
  difficultyPriceFactor,
  effectiveDayLength,
} from '../settings';

/** Множители сложности из дефолтов: игра по умолчанию берёт «низкие» цены (×6/8). */
const DEF_BUY_FACTOR = difficultyPriceFactor(DEFAULT_GAME_SETTINGS.constructionCost);
const DEF_RUN_FACTOR = difficultyPriceFactor(DEFAULT_GAME_SETTINGS.vehicleCosts);

describe('costs', () => {
  it('ванильный Kirby Paul Tank: 400000 * 7 / 256 = £10937', () => {
    expect(buyCost('engine', 7)).toBe(10937);
  });

  it('движок Iron Horse со сдвигом -2: 4-4-2 Lark factor 18 -> £7031', () => {
    // 400000 >> 2 = 100000; 100000 * 18 / 256 = 7031.25 -> 7031
    expect(buyCost('engine', 18, -2)).toBe(7031);
  });

  it('вагон Iron Horse со сдвигом +1: 2000 << 1 = 4000 база', () => {
    // 4000 * 144 / 256 = 2250
    expect(buyCost('wagon', 144, 1)).toBe(2250);
  });

  it('running cost STEAM со сдвигом -2', () => {
    // 5600 >> 2 = 1400; 1400 * 847 / 256 = 4632.03 -> 4632
    expect(runningCostPerYear('running_steam', 847, -2)).toBe(4632);
  });

  it('ванильный running cost: Kirby 5600 * 50 / 256 = £1093', () => {
    expect(price('running_steam', 50)).toBe(1093);
  });
});

describe('игровые значения по умолчанию', () => {
  it('Kirby Paul Tank на дефолтных настройках: (400000 × 6/8) × 7 / 256 = £8203', () => {
    // ровно дефолт, без правок: наборы выключены, и Kirby — машина активного набора.
    // Вернись дефолт к Iron Horse — тест упадёт здесь, а не промолчит
    const game = DEFAULT_GAME_SETTINGS;
    const kirby = activeTrains(game).find((t) => t.name === 'Kirby Paul Tank')!;
    expect(trainBuyCost(kirby, activeTrainsMeta(game), game)).toBe(8203);
  });
});

describe('деньги машины и состава', () => {
  const meta = trainsMeta;
  const engine = trains.find((t) => t.kind === 'engine')!;
  const wagon = trains.find((t) => t.kind === 'wagon')!;

  it('покупка берёт шифт по типу машины', () => {
    expect(trainBuyCost(engine, meta)).toBe(
      buyCost('engine', engine.cost_factor, meta.basecost_shifts.build_engine, 1950, false, DEF_BUY_FACTOR),
    );
    expect(trainBuyCost(wagon, meta)).toBe(
      buyCost('wagon', wagon.cost_factor, meta.basecost_shifts.build_wagon, 1950, false, DEF_BUY_FACTOR),
    );
  });

  it('содержание берёт паровой шифт только для паровых машин', () => {
    const steam = trains.find((t) => t.running_cost_base.includes('STEAM'))!;
    const other = trains.find((t) => !t.running_cost_base.includes('STEAM'))!;
    expect(trainRunningCostPerYear(steam, meta)).toBe(
      runningCostPerYear(
        'running_steam',
        steam.running_cost_factor,
        meta.basecost_shifts.running_steam,
        1950,
        false,
        DEF_RUN_FACTOR,
      ),
    );
    expect(trainRunningCostPerYear(other, meta)).toBe(
      runningCostPerYear(
        other.running_cost_base.includes('ELECTRIC') ? 'running_electric' : 'running_diesel',
        other.running_cost_factor,
        meta.basecost_shifts.running_diesel,
        1950,
        false,
        DEF_RUN_FACTOR,
      ),
    );
  });

  it('длина дня растягивает содержание и не трогает покупку', () => {
    const long = { ...DEFAULT_GAME_SETTINGS, jgrpp: true, dayLengthFactor: 8 };
    expect(trainRunningCostPerYear(engine, meta, long)).toBeCloseTo(
      trainRunningCostPerYear(engine, meta) * 8,
      6,
    );
    expect(trainBuyCost(engine, meta, long)).toBe(trainBuyCost(engine, meta));
  });

  it('wallclock: содержание за экономический год — 360/365 календарного', () => {
    const wallclock = { ...DEFAULT_GAME_SETTINGS, timekeeping: 'wallclock' as const };
    expect(trainRunningCostPerYear(engine, meta, wallclock)).toBeCloseTo(
      trainRunningCostPerYear(engine, meta) * (360 / 365),
      6,
    );
  });

  it('деньги состава = сумма по машинам с учётом количества', () => {
    const entries = [
      { train: engine, count: 2 },
      { train: wagon, count: 7 },
    ];
    const { buy, running } = consistMoney(entries, meta);
    expect(buy).toBe(2 * trainBuyCost(engine, meta) + 7 * trainBuyCost(wagon, meta));
    expect(running).toBeCloseTo(
      2 * trainRunningCostPerYear(engine, meta) + 7 * trainRunningCostPerYear(wagon, meta),
      6,
    );
  });

  it('пустой состав стоит ноль', () => {
    expect(consistMoney([], meta)).toEqual({ buy: 0, running: 0 });
  });
});

describe('incomeCurve', () => {
  const spec = { currentPayment: 5000, transitPeriods: [7, 255] as [number, number] };

  it('121 точка от нуля, доход не возрастает по времени', () => {
    const c = incomeCurve(100, 50, 20, spec);
    expect(c.length).toBe(121);
    expect(c[0].days).toBe(0);
    for (let i = 1; i < c.length; i++) expect(c[i].income).toBeLessThanOrEqual(c[i - 1].income);
  });

  it('диапазон не короче 2.5× текущего времени и 50 дней', () => {
    expect(incomeCurve(1, 1, 400, spec).at(-1)!.days).toBeCloseTo(1000, 6);
    expect(incomeCurve(1, 1, 0, { currentPayment: 1, transitPeriods: [1, 1] }).at(-1)!.days).toBeCloseTo(50, 6);
  });
});

describe('timeFactor', () => {
  const p1 = 7;
  const p2 = 255; // ванильный уголь

  it('255 до p1 периодов', () => {
    expect(timeFactor(0, p1, p2).factor).toBe(255);
    expect(timeFactor(p1, p1, p2).factor).toBe(255);
  });

  it('наклон -1 после p1', () => {
    expect(timeFactor(p1 + 1, p1, p2).factor).toBe(254);
    expect(timeFactor(p1 + 100, p1, p2).factor).toBe(155);
  });

  it('наклон -2 после p1+p2 (короткое окно: ваниль valuables 1/32)', () => {
    // p1=1, p2=32: transit 40 -> over1=39, over2=7 -> 255-39-7=209
    expect(timeFactor(40, 1, 32).factor).toBe(209);
  });

  it('минимум 31 на линейном участке', () => {
    expect(timeFactor(p1 + 224, p1, p2).factor).toBe(31);
  });

  it('хвост убывает и не опускается ниже 1', () => {
    const far = timeFactor(3000, 1, 32);
    expect(far.shift).toBe(25);
    expect(far.factor).toBeGreaterThanOrEqual(1);
    const farther = timeFactor(60000, 1, 32);
    expect(farther.factor).toBe(1);
  });

  it('монотонно не возрастает по времени', () => {
    let prev = Infinity;
    for (let t = 0; t < 2000; t += 7) {
      const { factor, shift } = timeFactor(t, 5, 40);
      const effective = factor / 2 ** (shift - 21);
      expect(effective).toBeLessThanOrEqual(prev + 1e-9);
      prev = effective;
    }
  });
});

describe('income', () => {
  it('ванильный уголь: 100 т на 100 тайлов без штрафа времени', () => {
    // 100*255*100*5916 / 2^21 = 7193.99 -> 7193
    const income = transportedGoodsIncome(100, 100, 0, {
      currentPayment: 5916,
      transitPeriods: [7, 255],
    });
    expect(income).toBe(7193);
  });

  it('FIRS уголь (payment 3536) платит меньше ванильного', () => {
    const firs = transportedGoodsIncome(100, 100, 0, {
      currentPayment: 3536,
      transitPeriods: [40, 255],
    });
    expect(firs).toBe(
      Math.floor((100 * 255 * 100 * 3536) / 2 ** 21),
    );
  });

  it('доход убывает со временем в пути', () => {
    const spec = { currentPayment: 5916, transitPeriods: [7, 255] as [number, number] };
    const fast = transportedGoodsIncome(100, 100, 4, spec);
    const slow = transportedGoodsIncome(100, 100, 40, spec);
    expect(slow).toBeLessThan(fast);
  });
});

describe('inflation', () => {
  it('1920 = 1.0', () => {
    const f = inflationFactors(1920, true);
    expect(f.price).toBe(1);
    expect(f.payment).toBe(1);
  });

  it('выключенная инфляция всегда 1.0', () => {
    expect(inflationFactors(2000, false).price).toBe(1);
  });

  it('цены растут быстрее выплат (amount 2 vs 1)', () => {
    const f = inflationFactors(1970, true);
    expect(f.price).toBeGreaterThan(f.payment);
    expect(f.payment).toBeGreaterThan(1);
  });

  it('фиксированные даты: в 1970 уже накоплено 50 лет с 1920', () => {
    expect(inflationFactors(1970, true, 2, true, 1970).price).toBeGreaterThan(1);
  });

  it('модель от старта: в год начала игры единица, дальше — та же таблица со сдвигом', () => {
    expect(inflationFactors(1970, true, 2, false, 1970).price).toBe(1);
    expect(inflationFactors(1970, true, 2, false, 1970).payment).toBe(1);
    // 30 лет начисления от старта 1970 = 30 лет фиксированной модели от 1920
    expect(inflationFactors(2000, true, 2, false, 1970).price).toBe(
      inflationFactors(1950, true, 2, true).price,
    );
  });

  it('модель от старта: год расчёта раньше начала партии — инфляции ещё нет', () => {
    expect(inflationFactors(1940, true, 2, false, 1970)).toEqual({ price: 1, payment: 1 });
  });

  it('дробный год не ломает таблицу: индекс усекается, а не читает мимо массива', () => {
    // поля года в настройках — <input type="number">, из них приходит и «2000.5»
    expect(inflationFactors(2000.5, true).price).toBe(inflationFactors(2000, true).price);
    // 2000 − 1950.5 = 49.5 года начисления, усечение даёт ровно 49 — как от старта в 1951
    expect(inflationFactors(2000, true, 2, false, 1950.5).price).toBe(
      inflationFactors(2000, true, 2, false, 1951).price,
    );
    expect(Number.isNaN(inflationFactors(2000.5, true).payment)).toBe(false);
  });

  it('заниженный год старта не разгоняет инфляцию сверх таблицы', () => {
    // 0 в поле «год начала игры» дало бы 170 лет начисления вместо нуля
    expect(inflationFactors(1950, true, 2, false, 0).price).toBe(
      inflationFactors(2090, true, 2, true).price,
    );
  });
});

describe('ставка оплаты груза', () => {
  const coal = cargoByLabel.get('COAL')!;
  const base = coal.initial_payment_by_economy.STEELTOWN;

  it('без инфляции равна базовой из данных', () => {
    expect(cargoPaymentRate(coal, 'STEELTOWN')).toBe(base);
  });

  it('с инфляцией растёт вместе с ценами', () => {
    const game = { ...DEFAULT_GAME_SETTINGS, inflation: true };
    const calc = { ...DEFAULT_CALC_SETTINGS, priceYear: 2000 };
    expect(cargoPaymentRate(coal, 'STEELTOWN', game, calc)).toBeGreaterThan(base);
  });

  it('экономика не выбрана — ноль', () => {
    expect(cargoPaymentRate(coal, null)).toBe(0);
  });

  it('груз без ставки в этой экономике — ноль, а не NaN', () => {
    const rate = cargoPaymentRate(coal, 'NO_SUCH_ECONOMY');
    expect(rate).toBe(0);
    expect(Number.isNaN(rate)).toBe(false);
  });
});

describe('wallclock', () => {
  it('рейсов в год = 360 / круг независимо от календаря', () => {
    const coal = cargoByLabel.get('COAL')!;
    const engine = trains.find(
      (t) => t.kind === 'engine' && t.power_hp > 0 && t.base_track_type === 'RAIL',
    )!;
    const wagon = trains.find(
      (t) => t.kind === 'wagon' && t.base_track_type === 'RAIL' && (t.capacities[2] ?? 0) > 0,
    )!;
    const trip = tripEconomics({
      entries: [
        { train: engine, count: 1 },
        { train: wagon, count: 5 },
      ],
      cargo: coal,
      payment: coal.initial_payment_by_economy.STEELTOWN,
      distanceTiles: 100,
      meta: trainsMeta,
      game: { ...DEFAULT_GAME_SETTINGS, timekeeping: 'wallclock' },
    });
    expect(trip.tripsPerYear).toBeCloseTo(360 / trip.roundTripDays, 9);
  });
});

describe('units', () => {
  it('mph -> internal -> mph', () => {
    expect(mphToInternal(90)).toBe(144);
    expect(internalToMph(144)).toBe(90);
  });

  it('внутренняя -> км/ч по формуле игры', () => {
    // Firebird: 112 миль/ч в списке покупки = 180 внутр. ед. = 181 км/ч в игре,
    // прямой перевод 112 * 1.609344 дал бы 180
    expect(internalToKmh(180)).toBe(181);
    // Kirby Paul Tank: 40 миль/ч = 64 внутр. ед.
    expect(internalToKmh(64)).toBe(64);
    expect(internalToMph(64)).toBe(40);
  });

  it('тайлы в день: 100 внутр. ед. = ~3.6 тайла', () => {
    expect(tilesPerDay(100)).toBeCloseTo(3.613, 2);
  });

  it('периоды из дней: 25 дней = 10 периодов', () => {
    expect(transitPeriodsFromDays(25)).toBe(10);
  });

  it('дни на дистанцию', () => {
    expect(daysForDistance(100, 144)).toBeCloseTo(100 / tilesPerDay(144), 6);
  });
});

describe('optimizer', () => {
  // у рандомизированного вагона ТТХ те же, что у обычного, а в списке покупки игры
  // он спрятан внутри группы вариантов — в выдаче должен быть обычный
  it('из близнецов берёт вагон, который в игре виден в списке покупки', () => {
    const results = optimizeConsists(
      trains,
      {
        year: 1938,
        distanceTiles: 380,
        cargo: cargoByLabel.get('COAL')!,
        economyId: 'STEELTOWN',
        maxLengthTiles: 3,
        allowElectric: false,
        game: DEFAULT_GAME_SETTINGS,
        calc: DEFAULT_CALC_SETTINGS,
      },
      trainsMeta,
      10,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.wagon.randomised)).toHaveLength(0);
  });

  // производство ограничивает загрузку: лишние вагоны только дорожают
  it('слабое предприятие укорачивает состав, сильное — набирает станцию', () => {
    const params = {
      year: 1938,
      distanceTiles: 82,
      cargo: cargoByLabel.get('COAL')!,
      economyId: 'STEELTOWN',
      maxLengthTiles: 6,
      allowElectric: false,
      game: DEFAULT_GAME_SETTINGS,
      calc: DEFAULT_CALC_SETTINGS,
    };
    const unlimited = optimizeConsists(trains, params, trainsMeta, 1)[0];
    const limited = optimizeConsists(
      trains,
      { ...params, productionPerMonth: 40 },
      trainsMeta,
      1,
    )[0];

    expect(unlimited.cargoPerTrip).toBe(unlimited.capacity);
    expect(unlimited.trainsNeeded).toBe(1);
    expect(limited.lengthTiles).toBeLessThan(unlimited.lengthTiles);
    // Hauls exactly what the station has collected since the last visit, capped by capacity.
    expect(limited.cargoPerTrip).toBeLessThanOrEqual(limited.capacity);
    const offeredLimited = 40 * 12 * limited.stationRating!.deliveredShare;
    expect(limited.cargoPerTrip * limited.tripsPerYear * limited.fleetSize).toBeCloseTo(
      offeredLimited,
      6,
    );
    expect(limited.buyCostTotal).toBeLessThan(unlimited.buyCostTotal);

    // поток, который один поезд не увозит, требует нескольких
    const heavy = optimizeConsists(
      trains,
      { ...params, productionPerMonth: 5000 },
      trainsMeta,
      1,
    )[0];
    expect(heavy.trainsNeeded).toBeGreaterThan(1);
    // The flow is shared by the fleet: each train takes its share, capped by capacity.
    expect(heavy.cargoPerTrip).toBeLessThanOrEqual(heavy.capacity);
    expect(heavy.cargoPerTrip).toBeCloseTo(
      Math.min(
        heavy.capacity,
        (5000 * 12 * heavy.stationRating!.deliveredShare) /
          (heavy.fleetSize * heavy.tripsPerYear),
      ),
      6,
    );
  });

  // рейтинг станции считается по периоду счётчика, растянутому замедлением экономики
  it('оптимизатор отдаёт рейтинг станции с множителем длины дня', () => {
    const dayLengthFactor = 5;
    const productionPerMonth = 510;
    // строка считается по машинам Iron Horse и грузу Steeltown — наборы включаем явно
    const game = {
      ...DEFAULT_GAME_SETTINGS,
      ironHorse: true,
      firs: true,
      jgrpp: true,
      dayLengthFactor,
    };
    const top = optimizeConsists(
      trains,
      {
        year: 1938,
        distanceTiles: 82,
        cargo: cargoByLabel.get('COAL')!,
        economyId: 'STEELTOWN',
        maxLengthTiles: 6,
        allowElectric: false,
        productionPerMonth,
        game,
        calc: DEFAULT_CALC_SETTINGS,
      },
      trainsMeta,
      1,
    )[0];

    const rated = {
      pickupIntervalDays: top.pickupIntervalDays,
      maxSpeedInternal: top.loadedSpeedInternal,
      // тот же поток за игровой день, что считает оптимизатор
      cargoPerDay: (productionPerMonth * 12) / (daysPerEconomyYear(game) * dayLengthFactor),
      // столько увозит один визит той же строки — от этого зависит остаток на станции
      visitCapacity: top.capacity,
      jgrpp: true,
    };
    expect(top.stationRating).toEqual(estimateStationRating({ ...rated, dayLengthFactor }));
    // без множителя тот же интервал разбился бы на впятеро больше периодов
    expect(top.stationRating!.rating).toBeGreaterThan(
      estimateStationRating({ ...rated, dayLengthFactor: 1 }).rating,
    );
  });

  // машины, которых в игре может ещё не быть, игрок выбрасывает из подбора чекбоксом
  it('excludedIds убирает машину из перебора и меняет выдачу', () => {
    const params = {
      year: 1961,
      distanceTiles: 200,
      cargo: cargoByLabel.get('COAL')!,
      economyId: 'STEELTOWN',
      maxLengthTiles: 6,
      allowElectric: false,
      game: DEFAULT_GAME_SETTINGS,
      calc: DEFAULT_CALC_SETTINGS,
    };
    const top = optimizeConsists(trains, params, trainsMeta, 1)[0];
    const withoutEngine = optimizeConsists(
      trains,
      { ...params, excludedIds: [top.engine.id] },
      trainsMeta,
      50,
    );
    expect(withoutEngine.some((r) => r.engine.id === top.engine.id)).toBe(false);

    const withoutWagon = optimizeConsists(
      trains,
      { ...params, excludedIds: [top.wagon.id] },
      trainsMeta,
      50,
    );
    expect(withoutWagon.some((r) => r.wagon.id === top.wagon.id)).toBe(false);
    // выдача не пустеет: подбор просто берёт следующий вариант
    expect(withoutWagon.length).toBeGreaterThan(0);
  });

  // --- search goal: profit against transported ---

  const goalBase = {
    year: 1938,
    cargo: cargoByLabel.get('COAL')!,
    economyId: 'STEELTOWN',
    allowElectric: false,
    game: DEFAULT_GAME_SETTINGS,
    calc: DEFAULT_CALC_SETTINGS,
  };

  // Money follows what the industry actually hands over: the share cuts the flow before it
  // is split between the trains, and income then follows the load a train really carries.
  it('доля вывоза режет поток, а не доход поверх загрузки', () => {
    const distanceTiles = 82;
    const r = optimizeConsists(
      trains,
      { ...goalBase, distanceTiles, maxLengthTiles: 6, productionPerMonth: 200 },
      trainsMeta,
      1,
    )[0];
    const share = r.stationRating!.deliveredShare;
    expect(share).toBeLessThan(1);

    const entries = [
      { train: r.engine, count: r.engineCount },
      { train: r.wagon, count: r.wagonCount },
    ];
    const trip = (cargoPerTrip: number) =>
      tripEconomics({
        entries,
        cargo: goalBase.cargo,
        payment: cargoPaymentRate(goalBase.cargo, goalBase.economyId, goalBase.game, goalBase.calc),
        distanceTiles,
        meta: trainsMeta,
        game: goalBase.game,
        calc: goalBase.calc,
        cargoPerTrip,
        fleetSize: r.fleetSize,
      });

    // Cargo per trip is the share of the output that one train of the fleet receives.
    expect(r.cargoPerTrip).toBeCloseTo(
      Math.min(r.capacity, (200 * 12 * share) / (r.fleetSize * r.tripsPerYear)),
      6,
    );
    // Money follows exactly that cargo, with no second multiplication by the share.
    expect(r.incomePerTrip).toBeCloseTo(trip(r.cargoPerTrip).incomePerTrip, 6);
    // ...and less than it would be if the station handed over the whole output.
    const withoutShare = trip(Math.min(r.capacity, (200 * 12) / (r.fleetSize * r.tripsPerYear)));
    expect(r.incomePerTrip).toBeLessThan(withoutShare.incomePerTrip);
  });

  // A saturated fleet loads from a full waiting pile, so the share no longer enters here.
  it('парк — узкое место: деньги по фактической загрузке, без вычета доли', () => {
    const distanceTiles = 300;
    const r = optimizeConsists(
      trains,
      {
        ...goalBase,
        distanceTiles,
        maxLengthTiles: 6,
        productionPerMonth: 400,
        goal: 'transported' as const,
        maxTrains: 1,
      },
      trainsMeta,
      1,
    )[0];
    expect(r.fleetLimited).toBe(true);
    // The train takes everything it can hold: the pile grew bigger than the consist, and the
    // station is handed exactly what the fleet carries off. A platform holding a pile at every
    // visit is also why no full-load branch is offered here — there is nothing to wait for.
    expect(r.cargoPerTrip).toBeCloseTo(r.capacity, 6);
    expect(r.stationRating!.backlog).toBeGreaterThan(0);
    expect(r.branchesDiffer).toBe(false);

    const full = tripEconomics({
      entries: [
        { train: r.engine, count: r.engineCount },
        { train: r.wagon, count: r.wagonCount },
      ],
      cargo: goalBase.cargo,
      payment: cargoPaymentRate(goalBase.cargo, goalBase.economyId, goalBase.game, goalBase.calc),
      distanceTiles,
      meta: trainsMeta,
      game: goalBase.game,
      calc: goalBase.calc,
      fleetSize: r.fleetSize,
    });
    expect(r.incomePerTrip).toBeCloseTo(full.incomePerTrip, 6);
    // The money of the row agrees with the haul it shows.
    expect(r.hauledPerYear).toBeCloseTo(r.cargoPerTrip * r.tripsPerYear * r.fleetSize, 6);
  });

  // The smallest fleet is measured against what is offered, not against the full output.
  it('меньший парк увозит отдаваемое — и он же выигрывает при цели «Прибыль»', () => {
    const params = {
      ...goalBase,
      distanceTiles: 300,
      maxLengthTiles: 7,
      allowElectric: true,
      productionPerMonth: 500,
    };
    const r = optimizeConsists(trains, params, trainsMeta, 1)[0];
    // Fewer trains than the full output would need...
    expect(r.fleetSize).toBeLessThan(r.trainsNeeded);
    // ...yet they clear everything the station offers: nothing is left standing.
    expect(r.fleetLimited).toBe(false);
    expect(r.stationRating!.backlog).toBe(0);
    expect(r.hauledPerYear).toBeCloseTo(500 * 12 * r.stationRating!.deliveredShare, 6);
    // And the fleet is minimal: one train less would not have moved it.
    if (r.fleetSize > 1) {
      const perTrain = r.tripsPerYear * r.capacity;
      expect((r.fleetSize - 1) * perTrain).toBeLessThan(r.hauledPerYear);
    }
  });

  // The goal changes both what is swept and the order of the output.
  it('цель «Вывоз» ставит первой строку с наибольшим вывозом за год', () => {
    // Production low enough that the two goals disagree: hauling the last few crates costs
    // more than they pay, so the profitable fleet is smaller than the one that hauls most.
    const params = { ...goalBase, distanceTiles: 82, maxLengthTiles: 6, productionPerMonth: 60 };
    const byProfit = optimizeConsists(trains, params, trainsMeta, 20);
    const byHauled = optimizeConsists(
      trains,
      { ...params, goal: 'transported' as const, maxTrains: 4 },
      trainsMeta,
      20,
    );
    expect(byHauled[0].hauledPerYear).toBe(Math.max(...byHauled.map((r) => r.hauledPerYear)));
    expect(byHauled[0].hauledPerYear).toBeGreaterThan(byProfit[0].hauledPerYear);
    // Ranking by profit stays the most profitable one: the transported goal promises no such thing.
    expect(byProfit[0].profitPerYear).toBeGreaterThanOrEqual(
      Math.max(...byProfit.map((r) => r.profitPerYear)) - 1,
    );
  });

  // Рейтинг кэшируется между кандидатами, и с остатком он зависит ещё и от того, сколько
  // увозит визит: ключ обязан ловить вместимость, иначе строка получит чужой рейтинг.
  it('кэш рейтинга не отдаёт строке рейтинг чужого парка', () => {
    const rows = optimizeConsists(
      trains,
      {
        ...goalBase,
        distanceTiles: 300,
        maxLengthTiles: 6,
        productionPerMonth: 400,
        goal: 'transported' as const,
        maxTrains: 1,
      },
      trainsMeta,
      40,
    );
    const dayLength = effectiveDayLength(goalBase.game);
    // Ключ кэша до этой правки: интервал входил только числом периодов, скорость — бонусом.
    const key = (r: (typeof rows)[number]) =>
      `${ratingPeriods(r.pickupIntervalDays, dayLength)}|${speedRating(r.loadedSpeedInternal)}`;

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.stationRating) continue;
      const group = groups.get(key(r)) ?? [];
      group.push(r);
      groups.set(key(r), group);
    }

    // Группа, в которой прежний ключ склеил бы кандидатов с разными парками.
    const mixed = [...groups.values()].filter(
      (group) =>
        new Set(group.map((r) => r.capacity)).size > 1 &&
        group.some((r) => r.stationRating!.backlog > 0),
    );
    expect(mixed.length).toBeGreaterThan(0);

    for (const group of mixed) {
      const sorted = [...group].sort((a, b) => a.capacity - b.capacity);
      // Больший состав увозит больше, оставляет меньше и стоит на станции лучше.
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].stationRating!.rating).toBeGreaterThanOrEqual(
          sorted[i - 1].stationRating!.rating - 1e-9,
        );
        expect(sorted[i].stationRating!.backlog).toBeLessThanOrEqual(
          sorted[i - 1].stationRating!.backlog + 1e-9,
        );
      }
      // И как минимум одна пара в группе действительно различается — иначе проверять нечего.
      const ratings = new Set(group.map((r) => r.stationRating!.rating));
      expect(ratings.size).toBeGreaterThan(1);
    }
  });

  // The fleet limit does not drop a candidate, it shows a capped haul instead.
  it('парка не хватает на поток → вывоз по провозной способности и пометка', () => {
    const r = optimizeConsists(
      trains,
      {
        ...goalBase,
        distanceTiles: 300,
        maxLengthTiles: 6,
        productionPerMonth: 400,
        goal: 'transported' as const,
        maxTrains: 1,
      },
      trainsMeta,
      1,
    )[0];
    expect(r.trainsNeeded).toBeGreaterThan(1);
    expect(r.fleetSize).toBe(1);
    expect(r.fleetLimited).toBe(true);
    // Вывоз по провозной способности: поезд уходит полным, потому что станция не пустеет.
    expect(r.hauledPerYear).toBeCloseTo(r.fleetSize * r.tripsPerYear * r.capacity, 6);
    // Станция отдаёт ровно то, что парк успевает вывезти: остаток растёт, пока рейтинг не
    // урежет поток до провозной способности — на этом равновесии вывоз и предложение равны.
    expect(r.hauledPerYear).toBeCloseTo(400 * 12 * r.stationRating!.deliveredShare, 6);
    // Парк не вывозит поток — на станции стоит постоянный остаток, и это та же пометка.
    expect(r.stationRating!.backlog).toBeGreaterThan(0);
  });

  // Consist physics is cached between calls: the key has to catch everything it depends on.
  it('кэш физики не отдаёт числа от прошлых настроек', () => {
    const params = {
      ...goalBase,
      distanceTiles: 180,
      maxLengthTiles: 6,
      productionPerMonth: 300,
      goal: 'transported' as const,
      maxTrains: 3,
    };
    const key = (rows: ReturnType<typeof optimizeConsists>) =>
      rows.map((r) => [r.engine.id, r.wagonCount, Math.round(r.profitPerYear), Math.round(r.roundTripDays * 100)].join('|'));

    // The very cache the tab keeps between edits of its fields.
    const cache = createOptimizerCache();
    const first = key(optimizeConsists(trains, params, trainsMeta, 20, cache));
    // In between: calls that change everything physics and prices depend on.
    optimizeConsists(trains, { ...params, distanceTiles: 400 }, trainsMeta, 20, cache);
    optimizeConsists(
      trains,
      { ...params, game: { ...DEFAULT_GAME_SETTINGS, jgrpp: true, dayLengthFactor: 4 } },
      trainsMeta,
      20,
      cache,
    );
    optimizeConsists(
      trains,
      { ...params, calc: { ...DEFAULT_CALC_SETTINGS, capacityIndex: 4 } },
      trainsMeta,
      20,
      cache,
    );
    expect(key(optimizeConsists(trains, params, trainsMeta, 20, cache))).toEqual(first);
  });

  // Two things used to leak the input order into the output: a comparator with a "differs by
  // more than 1" tolerance (not transitive), and picking the representative of a group of
  // identical wagons by which one was met first.
  it('выдача не зависит от порядка машин во входных данных', () => {
    const params = {
      ...goalBase,
      distanceTiles: 180,
      maxLengthTiles: 6,
      allowElectric: true,
      productionPerMonth: 500,
      goal: 'transported' as const,
      maxTrains: 4,
    };
    // The whole row is compared, in the order it came out: the wagon a row shows is part of
    // the answer (a shuffled input used to swap every one of them for an identical twin),
    // and rows that agree on every number are ordered by identifiers rather than by luck.
    const rows = (result: ReturnType<typeof optimizeConsists>) =>
      result.map((r) =>
        [r.engine.id, r.engineCount, r.wagon.id, r.wagonCount, r.fleetSize,
         Math.round(r.hauledPerYear), Math.round(r.profitPerYear),
         Math.round(r.buyCostTotal)].join('|'),
      );
    const straight = optimizeConsists(trains, params, trainsMeta, 50);
    const reversed = optimizeConsists([...trains].reverse(), params, trainsMeta, 50);
    expect(rows(reversed)).toEqual(rows(straight));
  });

  // The fleet sweep must not stop at the smallest fleet that clears what the station offers:
  // more trains shorten the interval, which lifts the rating, which lifts what the station
  // hands over — so under the profit goal a bigger fleet can be the more profitable one.
  it('цель «Прибыль» берёт больший парк, когда он прибыльнее', () => {
    const params = {
      ...goalBase,
      distanceTiles: 300,
      maxLengthTiles: 7,
      productionPerMonth: 500,
    };
    const small = optimizeConsists(trains, { ...params, maxTrains: 4 }, trainsMeta, 1)[0];
    const big = optimizeConsists(trains, { ...params, maxTrains: 12 }, trainsMeta, 1)[0];
    expect(big.fleetSize).toBeGreaterThan(small.fleetSize);
    expect(big.stationRating!.deliveredShare).toBeGreaterThan(small.stationRating!.deliveredShare);
    expect(big.profitPerYear).toBeGreaterThan(small.profitPerYear);
    // ...and the fleet shown is the most profitable one allowed, not merely a bigger one.
    const perLimit = Array.from({ length: 12 }, (_, i) =>
      optimizeConsists(trains, { ...params, maxTrains: i + 1 }, trainsMeta, 1)[0],
    );
    expect(big.profitPerYear).toBeCloseTo(Math.max(...perLimit.map((r) => r.profitPerYear)), 6);
  });

  // A shorter consist runs more often; under the haul goal that can beat a full-length one.
  it('короткий состав выигрывает по вывозу', () => {
    const params = {
      ...goalBase,
      distanceTiles: 300,
      maxLengthTiles: 7,
      productionPerMonth: 500,
      goal: 'transported' as const,
      maxTrains: 12,
    };
    const short = optimizeConsists(trains, params, trainsMeta, 50).find((r) => r.engine.id === 'kraken')!;
    const full = optimizeConsists(trains, { ...params, goal: 'profit' as const }, trainsMeta, 50)
      .find((r) => r.engine.id === 'kraken')!;
    // The station allows a longer consist than the haul goal picks.
    expect(short.lengthTiles).toBeLessThan(params.maxLengthTiles - 0.5);
    expect(short.wagonCount).toBeLessThan(full.wagonCount);
    expect(short.hauledPerYear).toBeGreaterThan(full.hauledPerYear);
  });

  // "Not enough trains" is about the trains, not about the station rating.
  it('парк не помечен ограниченным, когда вывоз режет доля, а не поезда', () => {
    const r = optimizeConsists(
      trains,
      {
        ...goalBase,
        distanceTiles: 300,
        maxLengthTiles: 7,
        allowElectric: true,
        productionPerMonth: 500,
        goal: 'transported' as const,
        maxTrains: 4,
      },
      trainsMeta,
      1,
    )[0];
    const offered = 500 * 12 * r.stationRating!.deliveredShare;
    // Formally fewer trains than the FULL output would need...
    expect(r.trainsNeeded).toBeGreaterThan(r.fleetSize);
    // ...but they clear everything the station offers, so they are not the constraint.
    expect(r.fleetSize * r.tripsPerYear * r.capacity).toBeGreaterThan(offered);
    expect(r.hauledPerYear).toBeCloseTo(offered, 6);
    expect(r.fleetLimited).toBe(false);
    expect(r.stationRating!.backlog).toBe(0);
  });

  // The rating hit its ceiling: a second train hauls no more and costs twice as much.
  it('при равном вывозе выигрывает парк поменьше', () => {
    const params = {
      ...goalBase,
      distanceTiles: 10,
      maxLengthTiles: 5,
      productionPerMonth: 60,
      goal: 'transported' as const,
    };
    const one = optimizeConsists(trains, { ...params, maxTrains: 1 }, trainsMeta, 1)[0];
    const upTo4 = optimizeConsists(trains, { ...params, maxTrains: 4 }, trainsMeta, 1)[0];
    expect(upTo4.hauledPerYear).toBeCloseTo(one.hauledPerYear, 6);
    expect(upTo4.fleetSize).toBe(1);
    expect(upTo4.profitPerYear).toBeCloseTo(one.profitPerYear, 6);
  });

  // Without a flow there is no delivered share, so there is nothing to rank by.
  it('без производства цель «Вывоз» равна цели «Прибыль»', () => {
    const params = { ...goalBase, distanceTiles: 82, maxLengthTiles: 6 };
    const byProfit = optimizeConsists(trains, params, trainsMeta, 20);
    const byHauled = optimizeConsists(
      trains,
      { ...params, goal: 'transported' as const, maxTrains: 4 },
      trainsMeta,
      20,
    );
    const key = (r: (typeof byProfit)[number]) =>
      `${r.engine.id}|${r.engineCount}|${r.wagon.id}|${r.wagonCount}|${r.fleetSize}|${r.profitPerYear}`;
    expect(byHauled.map(key)).toEqual(byProfit.map(key));
  });

  // The flow is shared by the fleet instead of reaching every train whole.
  it('вдвое больший парк берёт вдвое меньше груза за рейс и окупается хуже', () => {
    const params = {
      ...goalBase,
      distanceTiles: 82,
      maxLengthTiles: 2,
      productionPerMonth: 30,
      goal: 'transported' as const,
      // One consist for both outputs: the sweep would otherwise land on another engine.
      excludedIds: trains
        .filter(
          (t) =>
            (t.kind === 'engine' && t.id !== 'gowsty') ||
            (t.kind === 'wagon' && t.id !== 'coal_hopper_car_type_1_pony_gen_3A'),
        )
        .map((t) => t.id),
    };
    const one = optimizeConsists(trains, { ...params, maxTrains: 1 }, trainsMeta, 1)[0];
    const two = optimizeConsists(trains, { ...params, maxTrains: 2 }, trainsMeta, 1)[0];
    expect(one.fleetSize).toBe(1);
    expect(two.fleetSize).toBe(2);
    // Neither of them hit its capacity: it is the flow that is being split.
    expect(one.cargoPerTrip).toBeLessThan(one.capacity);
    expect(two.cargoPerTrip).toBeLessThan(two.capacity);
    // Each takes its share of what is offered: the flow is split, not the capacity.
    const offered = (r: typeof one) => 30 * 12 * r.stationRating!.deliveredShare;
    expect(one.cargoPerTrip).toBeCloseTo(offered(one) / one.tripsPerYear, 6);
    expect(two.cargoPerTrip).toBeCloseTo(offered(two) / (2 * two.tripsPerYear), 6);
    // A second train shortens the interval and lifts the share, so cargo per trip drops by
    // less than half — but it drops.
    expect(two.cargoPerTrip).toBeLessThan(one.cargoPerTrip);
    // The extra train loses no haul but pays for it in payback.
    expect(two.hauledPerYear).toBeGreaterThanOrEqual(one.hauledPerYear);
    expect(two.paybackYears!).toBeGreaterThan(one.paybackYears!);
  });
});

describe('physics', () => {
  // паровоз типа Arrow: 1900 hp, 140 т, TE coef 0.18, 90 mph, + 10 гружёных вагонов по 40 т
  const consist = {
    massT: 140 + 400,
    powerHp: 1900,
    teWeightProduct: 140 * 0.18,
    maxSpeedInternal: mphToInternal(90),
    numParts: 12,
  };

  it('maxTE = 9800 * Σ(вес*коэф)', () => {
    expect(maxTractiveEffortN(consist)).toBe(Math.floor(140 * 0.18 * 9800));
  });

  it('на низкой скорости тяга ограничена TE, на высокой — мощностью', () => {
    const low = forceN(consist, 10);
    const high = forceN(consist, 140);
    expect(low).toBe(maxTractiveEffortN(consist));
    expect(high).toBeLessThan(low);
  });

  it('balancing speed на ровном пути в разумных пределах и не выше лимита', () => {
    const v = balancingSpeed(consist);
    expect(v).toBeGreaterThan(50);
    expect(v).toBeLessThanOrEqual(consist.maxSpeedInternal);
  });

  it('на подъёме скорость ниже', () => {
    const flat = balancingSpeed(consist);
    const grade = balancingSpeed(consist, consist.massT);
    expect(grade).toBeLessThan(flat);
  });

  it('сопротивление растёт со скоростью', () => {
    expect(resistanceN(consist, 100)).toBeGreaterThan(resistanceN(consist, 10));
  });
});
