/**
 * Машины «под вопросом» для строки чекбоксов под таблицей подбора.
 *
 * Iron Horse держит несколько моделей на один пункт списка покупки: у Coil Carrier
 * это covered / covered_asymmetric / tarpaulin / uncovered плюс рандомизированный
 * вариант — в игре они лежат в одной группе вариантов, зовутся одинаково и имеют
 * одни ТТХ. В списке чекбоксов такие машины схлопываются в одну запись, иначе игрок
 * видит десяток одинаковых подписей и выключает их по одной, пока всплывает следующая.
 */
import type { Train } from '../../types';
import type { GameSettings } from '../../engine/settings';
import { introAvailability, type IntroAvailability } from '../../engine/availability';
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

/** Пункт списка покупки: игрок не различает машины с одним именем, ТТХ и датой. */
function purchaseKey(train: Train, capacityIndex: number): string {
  return [
    train.kind,
    train.base_track_type,
    train.name,
    train.capacities[capacityIndex] ?? 0,
    train.length,
    `${train.intro_year}-${train.intro_month}`,
  ].join('|');
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
    if (!r.engineIntro.certain) keys.add(purchaseKey(r.engine, capacityIndex));
    if (!r.wagonIntro.certain) keys.add(purchaseKey(r.wagon, capacityIndex));
  }
  for (const t of trains) {
    if (excludedIds.includes(t.id)) keys.add(purchaseKey(t, capacityIndex));
  }

  // в пункт входят все модели с теми же ТТХ, даже если в выдачу попала одна:
  // иначе выключать пришлось бы каждое всплывающее семейство по отдельности
  const groups = new Map<string, Train[]>();
  for (const train of trains) {
    const key = purchaseKey(train, capacityIndex);
    if (!keys.has(key)) continue;
    const group = groups.get(key);
    if (group) group.push(train);
    else groups.set(key, [train]);
  }

  const nameCounts = new Map<string, number>();
  for (const group of groups.values()) {
    nameCounts.set(group[0].name, (nameCounts.get(group[0].name) ?? 0) + 1);
  }

  return [...groups.values()]
    .map((group) => {
      // рандомизированный вагон в игре спрятан внутри группы вариантов — показываем обычный
      const train = group.find((t) => !t.randomised) ?? group[0];
      return {
        ids: group.map((t) => t.id),
        train,
        intro: introAvailability(train, year, game),
        capacity: train.capacities[capacityIndex] ?? 0,
        ambiguous: (nameCounts.get(train.name) ?? 0) > 1,
      };
    })
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
