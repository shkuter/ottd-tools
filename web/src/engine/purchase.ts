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
    game.ironHorse && !game.firs ? [...train.default_cargos].sort().join(',') : '',
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

/** Пункты в порядке первого появления машин на входе. */
export function purchaseEntries(
  trains: readonly Train[],
  capacityIndex: number,
  game: GameSettings,
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
    if (preferTrain(train, entry.train) < 0) entry.train = train;
  }
  return [...entries.values()];
}

export function purchaseRepresentatives(
  trains: readonly Train[],
  capacityIndex: number,
  game: GameSettings,
): Train[] {
  return purchaseEntries(trains, capacityIndex, game).map((entry) => entry.train);
}
