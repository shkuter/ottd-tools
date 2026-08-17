import { describe, expect, it } from 'vitest';
import { timeFactor, transportedGoodsIncome } from '../income';
import { inflationFactors } from '../inflation';
import { buyCost, price, runningCostPerYear } from '../costs';
import { balancingSpeed, forceN, maxTractiveEffortN, resistanceN } from '../physics';
import {
  daysForDistance,
  internalToMph,
  mphToInternal,
  tilesPerDay,
  transitPeriodsFromDays,
} from '../units';
import { optimizeConsists } from '../optimize';
import { trains, trainsMeta, cargoByLabel } from '../../dataset';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';

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
});

describe('units', () => {
  it('mph -> internal -> mph', () => {
    expect(mphToInternal(90)).toBe(144);
    expect(internalToMph(144)).toBe(90);
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
