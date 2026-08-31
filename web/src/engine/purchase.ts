/**
 * Пункты списка покупки: одна запись на то, что игрок различает в игре.
 *
 * NewGRF держит на один пункт покупки целое семейство моделей, различающихся только
 * спрайтом (у Coil Carrier это covered / covered_asymmetric / tarpaulin / uncovered плюс
 * рандомизированный вариант — в игре они лежат в одной группе вариантов). Списки, которые
 * читает человек, показывают такое семейство одной строкой; перебор оптимизатора группирует
 * иначе — по расчётному профилю, — и своей группировки не теряет.
 */
import type { Train } from '../types';
import type { GameSettings } from './settings';

/**
 * Ключ пункта: в него входит всё, что читает расчёт, а не только то, что видно подписью.
 * Вес — потому что каталог кормит расчёт состава, а в наборе есть машины, совпадающие во
 * всём остальном и различающиеся весом (Metro Coach surface 23 t против tube 21 t).
 *
 * Грузы по умолчанию входят только там, где их читает `canCarryIn`, — при включённом Iron
 * Horse и выключенном FIRS. С FIRS пригодность решает рефит, и внутри пункта он одинаков, а
 * вот `default_cargos` расходится (Coil Carrier: covered возит 3 метки, uncovered — 5,
 * рандомизированный — ни одной). Держать поле в ключе всегда значило бы показать три
 * «Coil Carrier» подряд там, где игра показывает один.
 */
export function purchaseKey(train: Train, capacityIndex: number, game: GameSettings): string {
  return [
    train.kind,
    train.base_track_type,
    train.name,
    train.capacities[capacityIndex] ?? 0,
    train.length,
    `${train.intro_year}-${train.intro_month}`,
    train.weight_t,
    game.trainSet === 'iron_horse' && !game.firs ? [...train.default_cargos].sort().join(',') : '',
  ].join('|');
}

export interface PurchaseEntry {
  key: string;
  /** Машина, которую показывают за весь пункт. */
  train: Train;
  /** Все машины пункта, включая представителя. */
  members: Train[];
}

/**
 * Which of two interchangeable vehicles a list should show. The game lists the non-randomised
 * variant as the head of its group of variants, with the randomised one hidden inside; the
 * identifier settles whatever is still tied. Nothing here looks at the order the vehicles
 * arrived in: that order is an accident of the dataset, and letting it decide would change
 * the vehicle shown as soon as the input is shuffled.
 */
export function preferTrain(a: Train, b: Train): number {
  if (a.randomised !== b.randomised) return a.randomised ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Whether the vehicle stands in the buy menu. Given, it outranks every other rule for
 * choosing which vehicle represents an entry: a row shown by a vehicle the game no longer
 * sells promises the player something their buy menu does not have.
 */
export type BuyMenuPredicate = (train: Train) => boolean;

/** Пункты в порядке первого появления машин на входе. */
export function purchaseEntries(
  trains: readonly Train[],
  capacityIndex: number,
  game: GameSettings,
  inBuyMenu?: BuyMenuPredicate,
): PurchaseEntry[] {
  const entries = new Map<string, PurchaseEntry>();
  for (const train of trains) {
    const key = purchaseKey(train, capacityIndex, game);
    const entry = entries.get(key);
    if (!entry) {
      entries.set(key, { key, train, members: [train] });
      continue;
    }
    entry.members.push(train);
    if (preferInBuyMenu(train, entry.train, inBuyMenu) < 0) entry.train = train;
  }
  return [...entries.values()];
}

/** Like `preferTrain`, but a vehicle still on sale outranks a withdrawn one. */
function preferInBuyMenu(a: Train, b: Train, inBuyMenu?: BuyMenuPredicate): number {
  if (inBuyMenu) {
    const soldA = inBuyMenu(a);
    if (soldA !== inBuyMenu(b)) return soldA ? -1 : 1;
  }
  return preferTrain(a, b);
}

export function purchaseRepresentatives(
  trains: readonly Train[],
  capacityIndex: number,
  game: GameSettings,
  inBuyMenu?: BuyMenuPredicate,
): Train[] {
  return purchaseEntries(trains, capacityIndex, game, inBuyMenu).map((entry) => entry.train);
}
