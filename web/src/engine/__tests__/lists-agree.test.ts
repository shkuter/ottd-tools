/**
 * Все списки машин отвечают на вопрос «продаётся ли она» одинаково.
 *
 * Каталог, подбор и снабжение строят свой список каждый, и правило раньше было выписано в
 * каждом заново. Держит их вместе одна функция и один контекст, поэтому здесь все три
 * гоняются на одном году и сверяются между собой — включая случай, который их и развёл:
 * ответ импортированной партии, о котором спрашивали только двое из трёх.
 */
import { describe, expect, it } from 'vitest';
import { activeTrains, availabilityContext, cargoByLabel, trainsMeta } from '../../dataset';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { standsInBuyMenu } from '../availability';
import { optimizeConsists } from '../optimize';
import { runSupplyInputs } from '../../features/industry-supply/inputs';
import { createOptimizerCache } from '../optimizeCache';

const game = { ...DEFAULT_GAME_SETTINGS, firs: true };
const calc = DEFAULT_CALC_SETTINGS;
const cargo = cargoByLabel.get('COAL')!;
const YEAR = 1960;

/** Что предлагает каталог — общее правило, применённое ко всему ростеру. */
function catalogueIds(sold: ReadonlySet<string> | null): Set<string> {
  const context = availabilityContext(game, sold);
  return new Set(activeTrains(game).filter((t) => standsInBuyMenu(t, YEAR, context)).map((t) => t.id));
}

// то же по выдаче подбора
function searchIds(sold: ReadonlySet<string> | null): Set<string> {
  const rows = optimizeConsists(
    activeTrains(game),
    {
      year: YEAR, distanceTiles: 96, cargo, economyId: game.firsEconomy,
      maxLengthTiles: 5, game, calc, soldIds: sold,
    },
    trainsMeta,
    20,
  );
  return new Set(rows.flatMap((r) => [r.engine.id, r.wagon.id]));
}

// и по вкладке снабжения, которая ищет тем же перебором
function supplyIds(sold: ReadonlySet<string> | null): Set<string> {
  const runs = runSupplyInputs({
    game, calc, industryId: 'tyre_plant',
    inputs: [{ cargoLabel: 'RUBR', ratio: 1, params: { distanceTiles: 96, productionPerMonth: 60 } }],
    year: YEAR, stationTiles: 5, maxTrains: 4,
    caches: new Map([['RUBR', createOptimizerCache()]]),
    soldIds: sold,
  });
  return new Set(runs.flatMap((r) => (r.best ? [r.best.engine.id, r.best.wagon.id] : [])));
}

describe('одно правило доступности на все списки', () => {
  it('подбор не берёт машину, которой нет в каталоге', () => {
    const catalogue = catalogueIds(null);
    for (const id of searchIds(null)) expect(catalogue).toContain(id);
  });

  it('снабжение не берёт машину, которой нет в каталоге', () => {
    const catalogue = catalogueIds(null);
    for (const id of supplyIds(null)) expect(catalogue).toContain(id);
  });

  it('партия продаёт машину, которую формула прячет, — и та возвращается в список', () => {
    // обратное направление: список партии не только сужает выдачу, но и возвращает в неё
    // машину, которую модель по своим срокам сочла бы снятой
    const withdrawn = activeTrains(game).find(
      (train) => !standsInBuyMenu(train, YEAR, availabilityContext(game, null)),
    )!;
    expect(withdrawn).toBeTruthy();
    const sold = new Set([withdrawn.id]);
    expect(standsInBuyMenu(withdrawn, YEAR, availabilityContext(game, sold))).toBe(true);
    expect(catalogueIds(sold)).toEqual(sold);
  });

  it('ответ импортированной партии действует на все три списка', () => {
    // партия продаёт единственный состав: всё остальное каталог, подбор и снабжение
    // обязаны отбросить — раньше снабжение об этом ответе не спрашивали вовсе
    const rows = optimizeConsists(
      activeTrains(game),
      { year: YEAR, distanceTiles: 96, cargo, economyId: game.firsEconomy, maxLengthTiles: 5, game, calc },
      trainsMeta,
      1,
    );
    const sold = new Set([rows[0].engine.id, rows[0].wagon.id]);

    expect(catalogueIds(sold)).toEqual(sold);
    for (const id of searchIds(sold)) expect(sold).toContain(id);
    for (const id of supplyIds(sold)) expect(sold).toContain(id);
  });
});
