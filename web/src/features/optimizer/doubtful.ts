/**
 * Машины «под вопросом» для строки чекбоксов под таблицей подбора.
 *
 * Iron Horse держит несколько моделей на один пункт списка покупки: у Coil Carrier
 * это covered / covered_asymmetric / tarpaulin / uncovered плюс рандомизированный
 * вариант — в игре они лежат в одной группе вариантов, зовутся одинаково и имеют
 * одни ТТХ. В списке чекбоксов такие машины схлопываются в одну запись, иначе игрок
 * видит десяток одинаковых подписей и выключает их по одной, пока всплывает следующая.
 *
 * Пункт и его представитель — общие для всего приложения (`engine/purchase.ts`), поэтому
 * чекбокс называет ту же машину, что показана строкой выдачи и каталогом конструктора.
 */
import type { Train } from '../../types';
import { availabilityContext, trainCapacity } from '../../dataset';
import type { GameSettings } from '../../engine/settings';
import {
  standsInBuyMenu,
  vehicleAvailability,
  type VehicleAvailability,
} from '../../engine/availability';
import { purchaseEntries, purchaseKey } from '../../engine/purchase';
import type { OptimizeResult } from '../../engine/optimize';

export interface DoubtfulGroup {
  /** Все id пункта: чекбокс выключает их разом. */
  ids: string[];
  /** Представитель для имени и подсказки — тот, который в игре виден в списке покупки. */
  train: Train;
  /** Стоит ли машина в списке покупки, какая граница под вопросом и даты появления. */
  availability: VehicleAvailability;
  /** Вместимость при текущем множителе — различитель для одноимённых вагонов. */
  capacity: number;
  /** Имя в списке встречается больше одного раза: подписи нужна вместимость. */
  ambiguous: boolean;
}

/**
 * Машины, которых в выбранном году может ещё не быть: помеченные `?` в выдаче
 * плюс уже исключённые — иначе исключённую машину нечем было бы вернуть.
 */
export interface DoubtfulOptions {
  /** Сравнение имён при сортировке; без него порядок решают вид и дата. */
  collator?: Intl.Collator;
  /**
   * Машины, которые продаёт импортированная партия, если её год и ростер — те же. Отсюда
   * же берётся, какой машиной показать пункт: иначе чекбокс называл бы одну машину, а
   * строка выдачи другую.
   */
  soldIds?: ReadonlySet<string> | null;
}

export function doubtfulGroups(
  results: OptimizeResult[],
  trains: Train[],
  excludedIds: readonly string[],
  year: number,
  game: GameSettings,
  capacityIndex: number,
  { collator, soldIds = null }: DoubtfulOptions,
): DoubtfulGroup[] {
  // отмечена в выдаче — значит и в списке: строка ставит «?» по обеим границам жизни
  // машины, и выключать надо ровно то, что помечено
  const buyMenu = availabilityContext(game, soldIds);
  const availabilityOf = (train: Train) => vehicleAvailability(train, year, buyMenu);
  const keys = new Set<string>();
  for (const r of results) {
    if (r.engineBuyMenu.state === 'uncertain') keys.add(purchaseKey(r.engine, capacityIndex, game));
    if (r.wagonBuyMenu.state === 'uncertain') keys.add(purchaseKey(r.wagon, capacityIndex, game));
  }
  for (const t of trains) {
    if (excludedIds.includes(t.id)) keys.add(purchaseKey(t, capacityIndex, game));
  }

  // в пункт входят все модели с теми же ТТХ, даже если в выдачу попала одна:
  // иначе выключать пришлось бы каждое всплывающее семейство по отдельности.
  // Представитель — продающаяся машина, как и в каталоге: чекбокс называет ту же
  const groups = purchaseEntries(trains, capacityIndex, game, (train) =>
    standsInBuyMenu(train, year, buyMenu),
  ).filter((entry) => keys.has(entry.key));

  // счёт идёт по подписи строки: пункт помечается неоднозначным, когда одноимённых
  // в списке несколько
  const displayName = (train: Train) => train.name;
  const nameCounts = new Map<string, number>();
  for (const entry of groups) {
    const name = displayName(entry.train);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return groups
    .map(({ train, members }) => ({
      ids: members.map((t) => t.id),
      train,
      availability: availabilityOf(train),
      capacity: trainCapacity(train, capacityIndex),
      ambiguous: (nameCounts.get(displayName(train)) ?? 0) > 1,
    }))
    .sort((a, b) =>
      a.train.kind !== b.train.kind
        ? a.train.kind === 'engine'
          ? -1
          : 1
        : a.availability.intro.year - b.availability.intro.year ||
          a.availability.intro.month - b.availability.intro.month ||
          (collator ? collator.compare(displayName(a.train), displayName(b.train)) : 0) ||
          a.capacity - b.capacity,
    );
}
