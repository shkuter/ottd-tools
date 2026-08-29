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
import { trainName } from '../../i18n/names';
import type { Locale } from '../../state/localeStore';
import type { Cargo, Train } from '../../types';
import { trainCapacity } from '../../dataset';
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
export interface DoubtfulOptions {
  /**
   * Язык подписей. Обязателен и передаётся, а не читается из стора: список строится в
   * `useMemo`, и из стора локаль не попала бы в массив зависимостей — забытая, она молча
   * оставила бы порядок и счёт одноимённых в языке первой отрисовки.
   */
  locale: Locale;
  /** Груз, под который считается вместимость-различитель. */
  cargo?: Cargo | null;
  /** Сравнение имён при сортировке; без него порядок решают вид и дата. */
  collator?: Intl.Collator;
}

export function doubtfulGroups(
  results: OptimizeResult[],
  trains: Train[],
  excludedIds: readonly string[],
  year: number,
  game: GameSettings,
  capacityIndex: number,
  { locale, cargo = null, collator }: DoubtfulOptions,
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

  // счёт идёт по имени, которое читает игрок: подпись двоится, когда одинаково
  // выглядит, а не когда совпадает английский оригинал под переводом
  const displayName = (train: Train) => trainName(train, locale);
  const nameCounts = new Map<string, number>();
  for (const entry of groups) {
    const name = displayName(entry.train);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return groups
    .map(({ train, members }) => ({
      ids: members.map((t) => t.id),
      train,
      intro: introAvailability(train, year, game),
      capacity: trainCapacity(train, cargo, capacityIndex),
      ambiguous: (nameCounts.get(displayName(train)) ?? 0) > 1,
    }))
    .sort((a, b) =>
      a.train.kind !== b.train.kind
        ? a.train.kind === 'engine'
          ? -1
          : 1
        : a.intro.year - b.intro.year ||
          a.intro.month - b.intro.month ||
          (collator ? collator.compare(displayName(a.train), displayName(b.train)) : 0) ||
          a.capacity - b.capacity,
    );
}
