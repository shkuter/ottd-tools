/**
 * Доход за доставку груза — точное воспроизведение
 * GetTransportedGoodsIncome (openttd/src/economy.cpp:953).
 *
 * timeFactor: 255 до p1 периодов, затем наклон -1, после ещё p2 — наклон -2,
 * не ниже 31; дальше асимптотический хвост ~31/(x/32+1) (fixed point 4 бита), минимум 1.
 */

const MIN_TIME_FACTOR = 31;
const MAX_TIME_FACTOR = 255;
const TIME_FACTOR_FRAC_BITS = 4;
const TIME_FACTOR_FRAC = 1 << TIME_FACTOR_FRAC_BITS;

export interface CargoPaymentSpec {
  /** База оплаты (prop 0x12 NewGRF, уже с учётом инфляции если нужна). */
  currentPayment: number;
  /** Периоды по 2.5 дня: [p1, p2] (NewGRF props 0x10/0x11). */
  transitPeriods: [number, number];
}

export interface TimeFactorResult {
  factor: number;
  shift: number;
}

export function timeFactor(
  transitPeriods: number,
  p1: number,
  p2: number,
): TimeFactorResult {
  const over1 = Math.max(transitPeriods - p1, 0);
  const over2 = Math.max(over1 - p2, 0);

  let overMax = MIN_TIME_FACTOR - MAX_TIME_FACTOR; // -224
  if (p2 > -(MIN_TIME_FACTOR - MAX_TIME_FACTOR)) {
    overMax += transitPeriods - p1;
  } else {
    overMax += 2 * (transitPeriods - p1) - p2;
  }

  if (overMax > 0) {
    const factor = Math.max(
      Math.floor(
        (2 * MIN_TIME_FACTOR * TIME_FACTOR_FRAC * TIME_FACTOR_FRAC) /
          (overMax + 2 * TIME_FACTOR_FRAC),
      ),
      1,
    );
    return { factor, shift: 21 + TIME_FACTOR_FRAC_BITS };
  }
  const factor = Math.max(MAX_TIME_FACTOR - over1 - over2, MIN_TIME_FACTOR);
  return { factor, shift: 21 };
}

/**
 * Доход в фунтах (базовая валюта) за numPieces единиц груза,
 * dist — манхэттенское расстояние в тайлах, transitPeriods — периоды в пути.
 * cargoAgingRate — настройка economy.cargo_aging_rate в процентах (def 100).
 */
export function transportedGoodsIncome(
  numPieces: number,
  dist: number,
  transitPeriods: number,
  spec: CargoPaymentSpec,
  cargoAgingRate = 100,
  /** JGRPP: traditional обрезает время в пути до 255 периодов. */
  paymentAlgorithm: 'modern' | 'traditional' = 'modern',
): number {
  let periods = Math.min(
    0xffff,
    Math.floor((transitPeriods * cargoAgingRate) / 100),
  );
  if (paymentAlgorithm === 'traditional') periods = Math.min(periods, 0xff);
  const [p1, p2] = spec.transitPeriods;
  const { factor, shift } = timeFactor(periods, p1, p2);
  return Math.floor(
    (dist * factor * numPieces * spec.currentPayment) / 2 ** shift,
  );
}
