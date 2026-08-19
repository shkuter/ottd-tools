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
import { tripEconomics } from '../trip';
import {
  activeTrains,
  activeTrainsMeta,
  trains,
  trainsMeta,
  cargoByLabel,
  economyIdForCargo,
  VANILLA_ECONOMY_ID,
} from '../../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  difficultyPriceFactor,
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
    const game = { ...DEFAULT_GAME_SETTINGS, ironHorse: false };
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

describe('economyIdForCargo', () => {
  const coal = cargoByLabel.get('COAL')!;
  it('без FIRS — VANILLA', () => {
    expect(economyIdForCargo({ ...DEFAULT_GAME_SETTINGS, firs: false }, coal)).toBe(VANILLA_ECONOMY_ID);
  });
  it('с FIRS — первая экономика с грузом, предпочтение уважается', () => {
    const first = economyIdForCargo(DEFAULT_GAME_SETTINGS, coal);
    expect(first).not.toBeNull();
    expect(coal.initial_payment_by_economy[first!]).toBeDefined();
    expect(economyIdForCargo(DEFAULT_GAME_SETTINGS, coal, 'STEELTOWN')).toBe('STEELTOWN');
    expect(economyIdForCargo(DEFAULT_GAME_SETTINGS, coal, 'NOPE')).toBe(first);
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
    // везёт ровно то, что успело произвестись за рейс, и не больше вместимости
    expect(limited.cargoPerTrip).toBeLessThanOrEqual(limited.capacity);
    expect(limited.cargoPerTrip * limited.tripsPerYear).toBeCloseTo(40 * 12, 6);
    expect(limited.buyCostTotal).toBeLessThan(unlimited.buyCostTotal);

    // поток, который один поезд не увозит, требует нескольких
    const heavy = optimizeConsists(
      trains,
      { ...params, productionPerMonth: 5000 },
      trainsMeta,
      1,
    )[0];
    expect(heavy.cargoPerTrip).toBe(heavy.capacity);
    expect(heavy.trainsNeeded).toBeGreaterThan(1);
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
