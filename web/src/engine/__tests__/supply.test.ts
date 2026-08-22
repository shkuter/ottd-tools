import { describe, expect, it } from 'vitest';
import {
  CONVERSION_CEILING,
  assessIndustrySupply,
  MARGINAL_RATIO,
  assessSupply,
  conversion,
  holdsSupplied,
  poolOutcome,
  secondaryOutput,
  supplyRatio,
  hasVerdict,
  supplyRule,
  supplyWindowDays,
  trainsForWindow,
  verdictFor,
  type InputOutcome,
  type SupplyVerdict,
} from '../supply';
import { accumulationRoundTrip } from '../waiting';
import { DEFAULT_GAME_SETTINGS } from '../settings';
import { industriesMeta, industryById } from '../../dataset';
import type { Industry } from '../../types';

/** The window as the data states it: 27 production cycles of 256 ticks. */
const WINDOW_TICKS = industriesMeta.supply_window_ticks;

const industry = (id: string): Industry => {
  const found = industryById.get(id);
  if (!found) throw new Error(`нет предприятия ${id} в данных`);
  return found;
};

describe('окно поставок', () => {
  it('данные несут окно в тиках: 27 циклов по 256', () => {
    expect(WINDOW_TICKS).toBe(27 * 256);
  });

  it('окно в движковых днях — тики через DAY_TICKS, без настроек', () => {
    expect(supplyWindowDays(WINDOW_TICKS)).toBeCloseTo(6912 / 74, 9);
  });
});

describe('конверсия вторичного предприятия', () => {
  it('все входы поданы: конверсия единица', () => {
    // blast_furnace: IORE 3 + COKE 3 + LIME 2 = 8, ровно потолок
    expect(conversion([3, 3, 2])).toBe(1);
  });

  it('один вход выпал из окна: 6/8 у четырёх входов ratio 2', () => {
    expect(conversion([2, 2, 2])).toBe(6 / CONVERSION_CEILING);
  });

  it('«любые три из пяти» — и из шести, и из семи: три входа ratio 3 дают единицу', () => {
    // any_3 не отдельное правило: 3 + 3 + 3 = 9 упирается в потолок 8
    expect(conversion([3, 3, 3])).toBe(1);
    expect(conversion([3, 3, 3, 3, 3])).toBe(1);
    expect(conversion([3, 3, 3, 3, 3, 3, 3])).toBe(1);
    // двух не хватает: 6/8
    expect(conversion([3, 3])).toBe(0.75);
  });

  it('выходной ratio урезает выпуск ещё раз', () => {
    // appliance_factory производит GOOD с ratio 3: (100 * 1 * 3) / 8
    expect(secondaryOutput(100, 1, 3)).toBeCloseTo(37.5, 9);
    // без второго множителя вышло бы 100 — во столько раз и завышал бы ответ
    expect(secondaryOutput(100, 1, 8)).toBe(100);
  });

  it('конверсия и выходной ratio перемножаются', () => {
    expect(secondaryOutput(100, 0.75, 4)).toBeCloseTo(37.5, 9);
  });
});

describe('отношение к окну и парк', () => {
  const windowDays = supplyWindowDays(WINDOW_TICKS);

  it('интервал ровно в окно — отношение единица', () => {
    expect(supplyRatio(windowDays, WINDOW_TICKS)).toBe(1);
  });

  it('круг вдвое длиннее окна: один поезд не держит, нужны два', () => {
    const roundTrip = 2 * windowDays;
    expect(supplyRatio(roundTrip, WINDOW_TICKS)).toBe(2);
    expect(trainsForWindow(roundTrip, WINDOW_TICKS)).toBe(2);
    // тот же маршрут двумя составами: интервал вдвое короче, отношение единица
    expect(supplyRatio(roundTrip / 2, WINDOW_TICKS)).toBe(1);
  });

  it('парк не бывает меньше одного состава', () => {
    expect(trainsForWindow(1, WINDOW_TICKS)).toBe(1);
  });

  it('граница вердикта: за единицей — мимо, у самой единицы — с оговоркой', () => {
    expect(verdictFor(0.5)).toBe('holds');
    expect(verdictFor(MARGINAL_RATIO)).toBe('holds');
    expect(verdictFor(MARGINAL_RATIO + 0.01)).toBe('marginal');
    expect(verdictFor(1)).toBe('marginal');
    expect(verdictFor(1.01)).toBe('misses');
    // промежуточная зона всё ещё удерживает: поезда просто ходят впритык
    expect(holdsSupplied(verdictFor(1))).toBe(true);
    expect(holdsSupplied(verdictFor(1.01))).toBe(false);
  });
});

describe('множитель длины дня', () => {
  it('окна и физического круга не касается', () => {
    // окно живёт в тиках, перевод в движковые дни настроек не читает вовсе
    const ratio = supplyRatio(120, WINDOW_TICKS);
    expect(supplyRatio(120, WINDOW_TICKS)).toBe(ratio);
  });

  it('через ожидание загрузки достаёт: накопление растягивается вместе с годом', () => {
    const base = {
      physicalRoundTripDays: 80,
      capacity: 200,
      fleetSize: 1,
      offeredPerYear: 200,
      game: DEFAULT_GAME_SETTINGS,
    };
    const slow = { ...DEFAULT_GAME_SETTINGS, jgrpp: true, dayLengthFactor: 5 };
    const normal = accumulationRoundTrip(base);
    const stretched = accumulationRoundTrip({ ...base, game: slow });
    const ratioNormal = supplyRatio(normal.roundTripDays, WINDOW_TICKS);
    const ratioStretched = supplyRatio(stretched.roundTripDays, WINDOW_TICKS);
    expect(ratioStretched).toBeGreaterThan(ratioNormal);
    expect(verdictFor(ratioStretched)).toBe('misses');
  });
});

describe('накопительный пул', () => {
  it('шахта: пороги 16 и 80, бонусы 150 % и 250 %', () => {
    const pool = industry('coal_mine').supply_pool!;
    expect(poolOutcome(0, pool)).toEqual({ level: 0, productionPercent: 100 });
    expect(poolOutcome(16, pool)).toEqual({ level: 1, productionPercent: 150 });
    expect(poolOutcome(79, pool)).toEqual({ level: 1, productionPercent: 150 });
    expect(poolOutcome(80, pool)).toEqual({ level: 2, productionPercent: 250 });
  });

  it('порт: те же пороги, умноженные на восемь', () => {
    const pool = industry('port').supply_pool!;
    expect(poolOutcome(127, pool).level).toBe(0);
    expect(poolOutcome(128, pool).level).toBe(1);
    expect(poolOutcome(640, pool).level).toBe(2);
  });
});

describe('правило снабжения по типу предприятия', () => {
  it('вторичка конвертирует, первичка и порт копят', () => {
    expect(supplyRule(industry('blast_furnace'))).toBe('conversion');
    expect(supplyRule(industry('coal_mine'))).toBe('pool');
    expect(supplyRule(industry('port'))).toBe('pool');
  });

  it('первичка без припасов — своё правило: доставки её выпуск не двигают', () => {
    const noSupplies = [...industryById.values()].filter(
      (i) => i.type === 'IndustryPrimaryNoSupplies',
    );
    expect(noSupplies.length).toBeGreaterThan(0);
    for (const industry of noSupplies) {
      expect(supplyRule(industry)).toBe('no-supplies');
      expect(hasVerdict(supplyRule(industry))).toBe(false);
    }
  });

  it('прочие типы — правило неизвестно, а не молчаливый ноль', () => {
    const others = [...industryById.values()].filter((i) => i.type === 'IndustryTertiary');
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) {
      expect(supplyRule(other)).toBe('unknown');
      expect(hasVerdict(supplyRule(other))).toBe(false);
    }
  });

  it('оба исхода без вердикта различимы расчётом, а не типом предприятия', () => {
    const tertiary = [...industryById.values()].find((i) => i.type === 'IndustryTertiary')!;
    const noSupplies = [...industryById.values()].find(
      (i) => i.type === 'IndustryPrimaryNoSupplies',
    )!;
    expect(supplyRule(tertiary)).not.toBe(supplyRule(noSupplies));
  });
});

describe('assessSupply', () => {
  const windowDays = supplyWindowDays(WINDOW_TICKS);

  /** Цель для получателя: входы берём из данных экономики Steeltown. */
  const targetFor = (id: string, cargoLabel: string) => {
    const found = industry(id);
    const accepts = found.economies.STEELTOWN?.accepts ?? [];
    return {
      industry: found,
      windowTicks: WINDOW_TICKS,
      cargoRatio: accepts.find((a) => a.label === cargoLabel)?.ratio ?? null,
      otherRatios: accepts.filter((a) => a.label !== cargoLabel).map((a) => a.ratio ?? 0),
    };
  };

  it('вторичка: отношение, парк и конверсия вместе', () => {
    const result = assessSupply(targetFor('blast_furnace', 'IORE'), {
      pickupIntervalDays: windowDays / 2,
      roundTripDays: windowDays * 2,
      deliveredPerWindow: null,
    });
    expect(result.rule).toBe('conversion');
    expect(result.ratio).toBe(0.5);
    expect(result.verdict).toBe('holds');
    expect(result.trainsForWindow).toBe(2);
    // IORE 3 + COKE 3 + LIME 2 = 8: вход внутри окна, конверсия полная
    expect(result.conversion).toBe(1);
    expect(result.pool).toBeNull();
  });

  it('вход выпал из окна: конверсия падает на его ratio', () => {
    const result = assessSupply(targetFor('blast_furnace', 'IORE'), {
      pickupIntervalDays: windowDays * 2,
      roundTripDays: windowDays * 2,
      deliveredPerWindow: null,
    });
    expect(result.verdict).toBe('misses');
    // без IORE остаются COKE 3 + LIME 2 = 5
    expect(result.conversion).toBe(5 / 8);
  });

  it('выпуск не задан: отношение null, вердикт unknown, без NaN', () => {
    const result = assessSupply(targetFor('blast_furnace', 'IORE'), {
      pickupIntervalDays: null,
      roundTripDays: windowDays,
      deliveredPerWindow: null,
    });
    expect(result.ratio).toBeNull();
    expect(result.verdict).toBe('unknown');
    expect(result.trainsForWindow).toBeNull();
    expect(Number.isNaN(result.ratio as number)).toBe(false);
  });

  it('выпуск не задан у получателя с пулом: уровня нет вовсе, а не полная мощность', () => {
    const result = assessSupply(targetFor('port', 'COAL'), {
      pickupIntervalDays: null,
      roundTripDays: windowDays,
      deliveredPerWindow: null,
    });
    expect(result.rule).toBe('pool');
    expect(result.pool).toBeNull();
    expect(result.verdict).toBe('unknown');
  });

  it('неизвестное правило не получает вердикта, даже когда интервал короткий', () => {
    const tertiary = [...industryById.values()].find((i) => i.type === 'IndustryTertiary')!;
    const result = assessSupply(
      { industry: tertiary, windowTicks: WINDOW_TICKS, cargoRatio: null, otherRatios: [] },
      { pickupIntervalDays: 1, roundTripDays: 1, deliveredPerWindow: 100 },
    );
    expect(result.rule).toBe('unknown');
    expect(result.verdict).toBe('unknown');
    // отношение всё же посчитано: оно про маршрут, а не про правило предприятия
    expect(result.ratio).toBeGreaterThan(0);
  });

  it('порт: пул считается по тому, что привозит этот маршрут', () => {
    const result = assessSupply(targetFor('port', 'COAL'), {
      pickupIntervalDays: windowDays,
      roundTripDays: windowDays,
      deliveredPerWindow: 200,
    });
    expect(result.rule).toBe('pool');
    expect(result.pool).toEqual({ level: 1, productionPercent: 150 });
    expect(result.conversion).toBeNull();
  });
});

describe('снабжение предприятия целиком', () => {
  /** Один вход с маршрутом, который укладывается в окно (или нет). */
  const routed = (
    verdict: SupplyVerdict,
    extra: Partial<InputOutcome> = {},
  ): InputOutcome => ({
    verdict,
    ratio: verdict === 'misses' ? 2 : 0.5,
    trainsForWindow: 2,
    unserved: false,
    deliveredPerWindow: null,
    ...extra,
  });

  const inputsOf = (id: string, economy: string, outcomes: (InputOutcome | null)[]) =>
    (industry(id).economies[economy]?.accepts ?? []).map((entry, i) => ({
      cargoLabel: entry.label,
      ratio: entry.ratio ?? 0,
      outcome: outcomes[i] ?? null,
    }));

  it('все четыре входа уложены в окно: конверсия единица, узкого места нет', () => {
    const result = assessIndustrySupply(
      industry('tyre_plant'),
      inputsOf('tyre_plant', 'STEELTOWN', Array(4).fill(routed('holds'))),
    );
    expect(result.conversion).toBe(1);
    expect(result.incomplete).toBe(false);
    expect(result.bottleneck).toBeNull();
  });

  it('часть входов не задана: итог помечен неполным, состояния различимы', () => {
    const result = assessIndustrySupply(
      industry('tyre_plant'),
      inputsOf('tyre_plant', 'STEELTOWN', [routed('holds'), routed('misses'), null, null]),
    );
    expect(result.incomplete).toBe(true);
    expect(result.states).toEqual(['holds', 'misses', 'unset', 'unset']);
    // незаданный вход не считается ни поданным, ни выпавшим: в конверсию входит только один
    expect(result.conversion).toBeCloseTo(2 / CONVERSION_CEILING, 9);
  });

  it('один вход выпал: конверсия ниже ровно на его ratio', () => {
    const result = assessIndustrySupply(
      industry('tyre_plant'),
      inputsOf('tyre_plant', 'STEELTOWN', [
        routed('holds'), routed('holds'), routed('holds'), routed('misses'),
      ]),
    );
    expect(result.conversion).toBeCloseTo(6 / CONVERSION_CEILING, 9);
    expect(result.bottleneck?.kind).toBe('fleet');
    expect(result.bottleneck?.input.cargoLabel).toBe('TYCO');
    expect(result.bottleneck).toMatchObject({ trains: 2 });
  });

  it('выпавший вход при упёршейся в потолок сумме: конверсия не меняется, узкого места нет', () => {
    // «любые три из пяти»: пять входов ratio 3, трёх поданных уже хватает на потолок
    const result = assessIndustrySupply(
      industry('appliance_factory'),
      inputsOf('appliance_factory', 'STEELTOWN', [
        routed('holds'), routed('holds'), routed('holds'), routed('misses'), routed('misses'),
      ]),
    );
    expect(result.conversion).toBe(1);
    expect(result.bottleneck).toBeNull();
  });

  it('пограничный вход входит в конверсию, но остаётся отличим от уверенного', () => {
    const result = assessIndustrySupply(
      industry('tyre_plant'),
      inputsOf('tyre_plant', 'STEELTOWN', [
        routed('holds'), routed('holds'), routed('holds'), routed('marginal'),
      ]),
    );
    expect(result.conversion).toBe(1);
    expect(result.states.at(-1)).toBe('marginal');
  });

  it('вход, который нечем возить, назван ограничением маршрута, а не парком', () => {
    const result = assessIndustrySupply(
      industry('tyre_plant'),
      inputsOf('tyre_plant', 'STEELTOWN', [
        routed('holds'), routed('holds'), routed('holds'),
        // нет состава под этот груз: парк называть нечем
        routed('misses', { unserved: true, trainsForWindow: null }),
      ]),
    );
    expect(result.bottleneck?.kind).toBe('limit');
    expect(result.bottleneck?.input.cargoLabel).toBe('TYCO');
  });

  it('нечем возить несколько входов: назван тот, чьё ratio больше', () => {
    // у tyre_plant все входы ratio 2, поэтому второму поднимаем ratio руками
    const inputs = inputsOf('tyre_plant', 'STEELTOWN', [
      routed('misses', { unserved: true, trainsForWindow: null }),
      routed('misses', { unserved: true, trainsForWindow: null }),
      null,
      null,
    ]);
    inputs[1].ratio = 5; // второй вход режет конверсию сильнее
    const result = assessIndustrySupply(industry('tyre_plant'), inputs);
    expect(result.bottleneck?.kind).toBe('limit');
    expect(result.bottleneck?.input).toBe(inputs[1]);
  });

  it('дешевле всего дотянуть тот вход, которому нужен меньший парк', () => {
    const result = assessIndustrySupply(
      industry('tyre_plant'),
      inputsOf('tyre_plant', 'STEELTOWN', [
        routed('holds'), routed('holds'),
        routed('misses', { trainsForWindow: 5 }),
        routed('misses', { trainsForWindow: 3 }),
      ]),
    );
    expect(result.bottleneck?.kind).toBe('fleet');
    expect(result.bottleneck?.input.cargoLabel).toBe('TYCO');
    expect(result.bottleneck).toMatchObject({ trains: 3 });
  });

  it('вторичное предприятие с одним входом ratio 6 не доходит до единицы', () => {
    const result = assessIndustrySupply(
      industry('dairy'),
      inputsOf('dairy', 'BASIC_TEMPERATE', [routed('holds')]),
    );
    expect(result.conversion).toBeCloseTo(6 / CONVERSION_CEILING, 9);
    // тянуть больше нечего: узкое место называется только по выпавшим входам
    expect(result.bottleneck).toBeNull();
  });

  it('порт: пул складывает маршруты, заданные на вкладке, и берёт свои пороги', () => {
    const result = assessIndustrySupply(
      industry('port'),
      inputsOf('port', 'BASIC_TEMPERATE', [
        routed('holds', { deliveredPerWindow: 300 }),
        routed('holds', { deliveredPerWindow: 400 }),
        null,
      ]),
    );
    expect(result.deliveredPerWindow).toBe(700);
    expect(result.pool).toEqual({ level: 2, productionPercent: 250 });
    expect(result.conversion).toBeNull();
    // третий груз никто не возит — ответ по-прежнему про заданные маршруты
    expect(result.incomplete).toBe(true);
  });

  it('порт ниже первого порога остаётся на базовом уровне', () => {
    const result = assessIndustrySupply(
      industry('port'),
      inputsOf('port', 'BASIC_TEMPERATE', [routed('holds', { deliveredPerWindow: 100 })]),
    );
    expect(result.pool).toEqual({ level: 0, productionPercent: 100 });
  });

  it('получатель с неизвестным правилом не получает ни конверсии, ни пула', () => {
    const result = assessIndustrySupply(
      industry('power_plant'),
      inputsOf('power_plant', 'STEELTOWN', [routed('holds')]),
    );
    expect(result.rule).toBe('unknown');
    expect(result.conversion).toBeNull();
    expect(result.pool).toBeNull();
    expect(result.bottleneck).toBeNull();
  });
});
