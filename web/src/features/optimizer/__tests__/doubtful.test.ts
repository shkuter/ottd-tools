/**
 * Строка чекбоксов под таблицей подбора: одинаковые для игрока машины —
 * одна запись, иначе список превращается в десяток одинаковых подписей.
 */
import { describe, expect, it } from 'vitest';
import { doubtfulGroups } from '../doubtful';
import { optimizeConsists, type OptimizeParams } from '../../../engine/optimize';
import { trains, trainsMeta, cargoByLabel } from '../../../dataset';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

// файл считает по машинам Iron Horse, а наборы по умолчанию выключены
const GAME = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };

const params: OptimizeParams = {
  year: 1961,
  distanceTiles: 285,
  cargo: cargoByLabel.get('ALUM')!,
  economyId: 'STEELTOWN',
  maxLengthTiles: 6,
  game: GAME,
  calc: DEFAULT_CALC_SETTINGS,
};

const results = optimizeConsists(trains, params, trainsMeta, 50);
const groups = (excluded: string[] = [], rows = results) =>
  doubtfulGroups(rows, trains, excluded, 1961, GAME, DEFAULT_CALC_SETTINGS.capacityIndex, {
    locale: 'en',
  });

/** Выдача после того, как игрок выключил контейнерные и платформенные вагоны. */
function afterExcludingContainers() {
  const excluded = groups()
    .filter((g) => g.train.kind === 'wagon')
    .flatMap((g) => g.ids);
  return { excluded, rows: optimizeConsists(trains, { ...params, excludedIds: excluded }, trainsMeta, 50) };
}

describe('doubtfulGroups', () => {
  it('семейства одной модели схлопываются в один пункт', () => {
    // Coil Carrier в Iron Horse — covered / covered_asymmetric / tarpaulin / uncovered
    // плюс рандомизированный: в игре это один пункт списка покупки, и в выдаче
    // разные семейства попадают в разные строки
    const { excluded, rows } = afterExcludingContainers();
    const shown = groups(excluded, rows);
    const coil = shown.filter((g) => g.train.name === 'Coil Carrier');
    expect(coil.length).toBeGreaterThan(0);
    expect(coil.some((g) => g.ids.length > 1)).toBe(true);
    // подписи не повторяются: имя + вместимость различают оставшиеся пункты
    const labels = shown.map((g) => `${g.train.name}|${g.ambiguous ? g.capacity : ''}`);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('выключенный пункт не всплывает вторым семейством с той же подписью', () => {
    // баг, ради которого группировка и сделана: выключаешь «Coil Carrier (33 т)»,
    // а в выдаче встаёт другое семейство под тем же именем — и так десяток раз
    const { excluded, rows } = afterExcludingContainers();
    const coil = groups(excluded, rows).find((g) => g.train.name === 'Coil Carrier')!;
    const stillExcluded = [...excluded, ...coil.ids];
    const next = optimizeConsists(trains, { ...params, excludedIds: stillExcluded }, trainsMeta, 50);
    const idx = DEFAULT_CALC_SETTINGS.capacityIndex;
    expect(
      next.some((r) => r.wagon.name === 'Coil Carrier' && r.wagon.capacities[idx] === coil.capacity),
    ).toBe(false);
    const after = groups(stillExcluded, next);
    expect(
      after.filter((g) => g.train.name === 'Coil Carrier' && g.capacity === coil.capacity),
    ).toHaveLength(1);
  });

  it('представитель группы — не рандомизированный вагон', () => {
    for (const g of groups()) expect(g.train.randomised).toBe(false);
  });

  it('одноимённые пункты с разной вместимостью помечены как неоднозначные', () => {
    const containers = groups().filter((g) => g.train.name === 'Container Wagon');
    expect(containers.length).toBeGreaterThan(1);
    for (const g of containers) expect(g.ambiguous).toBe(true);
  });

  it('исключённая машина остаётся в списке — её можно вернуть', () => {
    const target = groups().find((g) => g.train.kind === 'wagon')!;
    const withoutIt = optimizeConsists(trains, { ...params, excludedIds: target.ids }, trainsMeta, 50);
    const after = doubtfulGroups(
      withoutIt, trains, target.ids, 1961, GAME, DEFAULT_CALC_SETTINGS.capacityIndex,
      { locale: 'en' },
    );
    expect(after.some((g) => g.ids.includes(target.ids[0]))).toBe(true);
    expect(withoutIt.some((r) => target.ids.includes(r.wagon.id))).toBe(false);
  });

  it('машины, которых в этом году точно нет сомнений, в список не попадают', () => {
    // Little Bear (декабрь 1954) в 1961-м доступен при любом случайном сдвиге
    expect(groups().some((g) => g.train.id === 'little_bear')).toBe(false);
  });
});
