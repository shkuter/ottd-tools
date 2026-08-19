/**
 * DATE — the current date of the game, stored as days since the start of year 0.
 * The calculator only needs the year, so this follows the year half of
 * CalendarConvertDateToYMD (timer_game_common.cpp:64).
 */

import type { Chunk } from '../chunks';
import { asNumber, readRecord } from '../values';

const DAYS_IN_YEAR = 365;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function yearOfDate(date: number): number {
  // 400 years hold 97 leap days, so the large steps come first and the remainder is refined
  let year = 400 * Math.floor(date / (DAYS_IN_YEAR * 400 + 97));
  let rem = date % (DAYS_IN_YEAR * 400 + 97);

  if (rem >= DAYS_IN_YEAR * 100 + 25) {
    year += 100;
    rem -= DAYS_IN_YEAR * 100 + 25;
    year += 100 * Math.floor(rem / (DAYS_IN_YEAR * 100 + 24));
    rem = rem % (DAYS_IN_YEAR * 100 + 24);
  }

  if (!isLeapYear(year) && rem >= DAYS_IN_YEAR * 4) {
    year += 4;
    rem -= DAYS_IN_YEAR * 4;
  }

  year += 4 * Math.floor(rem / (DAYS_IN_YEAR * 4 + 1));
  rem = rem % (DAYS_IN_YEAR * 4 + 1);

  while (rem >= (isLeapYear(year) ? DAYS_IN_YEAR + 1 : DAYS_IN_YEAR)) {
    rem -= isLeapYear(year) ? DAYS_IN_YEAR + 1 : DAYS_IN_YEAR;
    year++;
  }

  return year;
}

export function readGameYear(chunk: Chunk | undefined): number | undefined {
  if (!chunk?.fields) return undefined;
  const record = chunk.records[0];
  if (!record) return undefined;
  const date = asNumber(readRecord(record.data, chunk.fields).get('date'));
  return date == null ? undefined : yearOfDate(date);
}
