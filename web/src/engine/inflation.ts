/**
 * Инфляция OpenTTD (economy.cpp:696): помесячный компаунд
 * infl += (infl * amount * 54) >> 16, действует с 1920 по 2090.
 * amount цен = difficulty.initial_interest (def 2), выплат = amount - 1.
 *
 * ВНИМАНИЕ: Iron Horse фатально несовместим с включённой инфляцией
 * (header.pynml: error(FATAL)) — по умолчанию расчёты ведём без неё.
 */

const BASE_YEAR = 1920;
const MAX_YEAR = 2090;
const FIXED_ONE = 65536;

export interface InflationFactors {
  /** Множитель цен (fixed point 16.16 / 65536). */
  price: number;
  /** Множитель выплат за груз. */
  payment: number;
}

const tables = new Map<number, { price: number[]; payment: number[] }>();

function buildTables(interest: number): { price: number[]; payment: number[] } {
  const price: number[] = [];
  const payment: number[] = [];
  let p = FIXED_ONE;
  let q = FIXED_ONE;
  const amountPrice = interest;
  const amountPayment = Math.max(0, interest - 1);
  for (let year = BASE_YEAR; year <= MAX_YEAR; year++) {
    price.push(p);
    payment.push(q);
    for (let month = 0; month < 12; month++) {
      p += Math.floor((p * amountPrice * 54) / 65536);
      q += Math.floor((q * amountPayment * 54) / 65536);
    }
  }
  return { price, payment };
}

/** Множители инфляции на начало года (initial_interest: 2..4, def 2). */
export function inflationFactors(
  year: number,
  inflationOn: boolean,
  interest = 2,
): InflationFactors {
  if (!inflationOn) return { price: 1, payment: 1 };
  let table = tables.get(interest);
  if (!table) {
    table = buildTables(interest);
    tables.set(interest, table);
  }
  const idx = Math.min(Math.max(year, BASE_YEAR), MAX_YEAR) - BASE_YEAR;
  return {
    price: table.price[idx] / FIXED_ONE,
    payment: table.payment[idx] / FIXED_ONE,
  };
}
