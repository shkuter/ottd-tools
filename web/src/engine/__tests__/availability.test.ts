/**
 * Появление машины в игре: дата точнее года и вдобавок рандомизируется,
 * поэтому машина «такого-то года» в этом году может ещё не продаваться.
 */
import { describe, expect, it } from 'vitest';
import { introAvailability, introRandomisationActive } from '../availability';
import { DEFAULT_GAME_SETTINGS } from '../settings';
import { trains } from '../../dataset';
import type { Train } from '../../types';

const rat = trains.find((t) => t.id === 'rat')!;
const containerWagon = trains.find((t) => t.id === 'intermodal_car_pony_gen_4B')!;

const vanilla = { ...DEFAULT_GAME_SETTINGS, jgrpp: false };
const jgrpp = { ...DEFAULT_GAME_SETTINGS, jgrpp: true };
const jgrppNoRandom = { ...jgrpp, vehicleIntroRandomisation: false };

describe('данные о датах появления', () => {
  it('Iron Horse разводит машины поколения по месяцам', () => {
    // gen 4 ростера Pony начинается в 1960: контейнерный вагон — с мая,
    // Rat вынесен на год раньше (intro_year_offset = -1) и в декабрь как joker
    expect([containerWagon.intro_year, containerWagon.intro_month]).toEqual([1960, 5]);
    expect([rat.intro_year, rat.intro_month]).toEqual([1959, 12]);
  });
});

describe('introRandomisationActive', () => {
  it('в ванили рандомизация встроена и не отключается', () => {
    expect(introRandomisationActive(vanilla)).toBe(true);
  });

  it('в JGRPP читается настройка', () => {
    expect(introRandomisationActive(jgrpp)).toBe(true);
    expect(introRandomisationActive(jgrppNoRandom)).toBe(false);
  });
});

describe('introAvailability', () => {
  it('машина своего года не гарантирована: она вводится не 1 января', () => {
    const a = introAvailability(containerWagon, 1960, jgrppNoRandom);
    expect(a.certain).toBe(false);
    expect([a.latestYear, a.latestMonth]).toEqual([1960, 5]);
  });

  it('следующий год без рандомизации — уже гарантия', () => {
    expect(introAvailability(containerWagon, 1961, jgrppNoRandom).certain).toBe(true);
  });

  it('рандомизация растягивает появление почти на полтора года', () => {
    // 1 мая 1960 + 511 дней = 23 сентября 1961
    const a = introAvailability(containerWagon, 1961, jgrpp);
    expect([a.latestYear, a.latestMonth]).toEqual([1961, 9]);
    expect(a.certain).toBe(false);
    // а вот в 1962-м вагон есть при любом сдвиге
    expect(introAvailability(containerWagon, 1962, jgrpp).certain).toBe(true);
  });

  it('локомотив года назад тоже под вопросом, пока рандомизация включена', () => {
    expect(introAvailability(rat, 1960, jgrpp).certain).toBe(false);
    expect(introAvailability(rat, 1960, jgrppNoRandom).certain).toBe(true);
  });

  it('старая машина в продаже давно', () => {
    const old: Train = { ...rat, intro_year: 1900, intro_month: 1 };
    expect(introAvailability(old, 1960, jgrpp).certain).toBe(true);
  });
});
