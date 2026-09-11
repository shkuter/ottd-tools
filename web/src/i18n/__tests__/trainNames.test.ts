/**
 * Имя машины в интерфейсе — то, которым её зовёт игра в этом же языке. Отсюда три следствия,
 * которые тут и стерегутся: перевод берётся из словаря по id, поиск и сортировка идут по
 * отображаемому имени, а ключ группировки покупок — наоборот, по имени из данных, иначе
 * смена языка перекроила бы каталог.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchesTrainName, trainName } from '../names';
import { trains } from '../../dataset';
import { vanillaTrains } from '../../vanilla';
import { purchaseKey } from '../../engine/purchase';
import { optimizerSortValues } from '../../features/optimizer/sorting';
import { catalogueSortValues } from '../../features/consist/sorting';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useLocaleStore } from '../../state/localeStore';
import vehiclesRu from '../vehicles.ru.json';
import type { OptimizeResult } from '../../engine/optimize';

const kirby = vanillaTrains.find((t) => t.id === 'vanilla_0')!;
/** Монорельсовый Wizzowow Z99: русская локаль игры оставила его английским. */
const untranslated = vanillaTrains.find((t) => t.id === 'vanilla_56')!;
const ironHorse = trains[0]!;

describe('имя машины', () => {
  it('на русском — то, которым машину зовёт игра', () => {
    expect(trainName(kirby, 'ru')).toBe('Паровоз Kirby Paul Tank');
    expect(trainName(kirby, 'en')).toBe('Kirby Paul Tank (Steam)');
  });

  it('машину без русского имени показывает английским, как и игра', () => {
    expect(trainName(untranslated, 'ru')).toBe(untranslated.name);
    expect(untranslated.name).toBe('Wizzowow Z99');
  });

  it('машину Iron Horse не переводит ни в одном языке', () => {
    expect(trainName(ironHorse, 'ru')).toBe(ironHorse.name);
    expect(trainName(ironHorse, 'en')).toBe(ironHorse.name);
    expect(ironHorse.id in vehiclesRu).toBe(false);
  });

  it('словарь покрывает каждую ванильную машину', () => {
    const missing = vanillaTrains.filter((t) => !(t.id in vehiclesRu)).map((t) => t.id);
    expect(missing).toEqual([]);
    expect(Object.keys(vehiclesRu)).toHaveLength(vanillaTrains.length);
  });

  it('словарь ключуется id, а не именем: одинаковых имён в наборе хватает', () => {
    const names = vanillaTrains.map((t) => t.name);
    expect(new Set(names).size).toBeLessThan(names.length);
  });
});

describe('поиск и сортировка идут по тому, что видно', () => {
  // поиск и сортировка читают язык из стора: они зовутся из мест, где локаль уже выбрана
  beforeEach(() => useLocaleStore.getState().setLocale('ru'));
  afterEach(() => useLocaleStore.getState().setLocale('en'));

  it('на русском «Паровоз» находит паровозы', () => {
    const found = vanillaTrains.filter((t) => matchesTrainName(t, 'Паровоз'));
    expect(found.length).toBeGreaterThan(5);
    expect(found).toContain(kirby);
  });

  it('сортировка каталога следует языку', () => {
    const values = catalogueSortValues(
      { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const },
      DEFAULT_CALC_SETTINGS,
      'metric',
    );
    expect(values.name(kirby)).toBe('Паровоз Kirby Paul Tank');
  });

  it('сортировка выдачи следует языку', () => {
    const row = (train: typeof kirby) => ({ engine: train, wagon: train }) as OptimizeResult;
    const values = optimizerSortValues();
    expect(values.engine(row(kirby))).toBe('Паровоз Kirby Paul Tank');
  });
});

describe('ключ группировки покупок', () => {
  // именно на русском: на английском отображаемое имя и имя из данных совпадают, и подмена
  // одного другим прошла бы незамеченной
  beforeEach(() => useLocaleStore.getState().setLocale('ru'));
  afterEach(() => useLocaleStore.getState().setLocale('en'));

  it('не зависит от языка интерфейса', () => {
    const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const };
    // ключ сравнивает машины между собой; поедь он за языком, пункты каталога схлопывались
    // бы по-разному в разных локалях
    expect(purchaseKey(kirby, 0, game)).toContain(kirby.name);
    expect(purchaseKey(kirby, 0, game)).not.toContain('Паровоз');
  });
});
