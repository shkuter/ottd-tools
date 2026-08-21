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
import type { GameSettings } from '../../engine/settings';
import { introAvailability, type IntroAvailability } from '../../engine/availability';
import { purchaseEntries, purchaseKey } from '../../engine/purchase';
import type { OptimizeResult } from '../../engine/optimize';

export interface DoubtfulGroup {
  /** Все id пункта: чекбокс выключает их разом. */
  ids: string[];
  /** Представитель для имени и подсказки — тот, который в игре виден в списке покупки. */
  train: Train;
  intro: IntroAvailability;
  /** Вместимость при текущем множителе — различитель для одноимённых вагонов. */
  capacity: number;
  /** Имя в списке встречается больше одного раза: подписи нужна вместимость. */
  ambiguous: boolean;
}

/**
 * Машины, которых в выбранном году может ещё не быть: помеченные `?` в выдаче
 * плюс уже исключённые — иначе исключённую машину нечем было бы вернуть.
 */
export function doubtfulGroups(
  results: OptimizeResult[],
  trains: Train[],
  excludedIds: readonly string[],
  year: number,
  game: GameSettings,
  capacityIndex: number,
  collator?: Intl.Collator,
): DoubtfulGroup[] {
  const keys = new Set<string>();
  for (const r of results) {
    if (!r.engineIntro.certain) keys.add(purchaseKey(r.engine, capacityIndex, game));
    if (!r.wagonIntro.certain) keys.add(purchaseKey(r.wagon, capacityIndex, game));
  }
  for (const t of trains) {
    if (excludedIds.includes(t.id)) keys.add(purchaseKey(t, capacityIndex, game));
  }

  // в пункт входят все модели с теми же ТТХ, даже если в выдачу попала одна:
  // иначе выключать пришлось бы каждое всплывающее семейство по отдельности
  const groups = purchaseEntries(trains, capacityIndex, game).filter((entry) => keys.has(entry.key));

  const nameCounts = new Map<string, number>();
  for (const entry of groups) {
    nameCounts.set(entry.train.name, (nameCounts.get(entry.train.name) ?? 0) + 1);
  }

  return groups
    .map(({ train, members }) => ({
      ids: members.map((t) => t.id),
      train,
      intro: introAvailability(train, year, game),
      capacity: train.capacities[capacityIndex] ?? 0,
      ambiguous: (nameCounts.get(train.name) ?? 0) > 1,
    }))
    .sort((a, b) =>
      a.train.kind !== b.train.kind
        ? a.train.kind === 'engine'
          ? -1
          : 1
        : a.intro.year - b.intro.year ||
          a.intro.month - b.intro.month ||
          (collator ? collator.compare(a.train.name, b.train.name) : 0) ||
          a.capacity - b.capacity,
    );
}
