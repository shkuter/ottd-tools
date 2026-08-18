/**
 * Когда машина реально появляется в списке покупки игры.
 *
 * Калькулятор работает с годом, а игра — с датой: NewGRF задаёт день появления
 * (Iron Horse — `date(intro_year, 1 + intro_date_months_offset, 1)`,
 * train/schemas.py introduction_date), поэтому машины одного поколения расползаются
 * по месяцам. Сверх того игра сдвигает дату вперёд на случайные 0…511 дней
 * (`GB(r, 0, 9)`, engine.cpp StartupOneEngine): сдвиг детерминирован seed'ом карты,
 * но заранее его знать нельзя. Отсюда третий вариант ответа помимо «есть» и «нет» —
 * «может появиться позже».
 */
import type { Train } from '../types';
import type { GameSettings } from './settings';

/** Максимальный случайный сдвиг даты появления, дней (GB(r, 0, 9) = 0…511). */
export const INTRO_RANDOM_MAX_DAYS = 511;

export interface IntroAvailability {
  /** Базовая дата появления из данных: год и месяц. */
  year: number;
  month: number;
  /** Поздний край с учётом рандомизации (равен базовой дате, если её нет). */
  latestYear: number;
  latestMonth: number;
  /** Даты рандомизируются: появление плавает в интервале от базовой даты до позднего края. */
  randomised: boolean;
  /** false — в выбранном году машина может ещё не появиться. */
  certain: boolean;
}

/**
 * Действует ли рандомизация дат появления. В ванили она встроена и не отключается
 * (engine.cpp:777), JGRPP выносит её в настройку, включённую по умолчанию.
 */
export function introRandomisationActive(game: GameSettings): boolean {
  return game.jgrpp ? game.vehicleIntroRandomisation : true;
}

/**
 * Появление машины относительно выбранного года.
 *
 * `certain` — только если машина в продаже с 1 января этого года: месяц игрока
 * неизвестен, поэтому гарантия даётся по началу года. Год начала игры не учитываем:
 * в игре первые два года после старта не рандомизируются (engine.cpp:777), но старт
 * калькулятору не задаётся, так что для ранних машин пометка выйдет осторожнее нужного.
 */
export function introAvailability(
  train: Train,
  year: number,
  game: GameSettings,
): IntroAvailability {
  const randomised = introRandomisationActive(game);
  const base = Date.UTC(train.intro_year, train.intro_month - 1, 1);
  const latest = randomised ? base + INTRO_RANDOM_MAX_DAYS * 86_400_000 : base;
  const latestDate = new Date(latest);
  return {
    year: train.intro_year,
    month: train.intro_month,
    latestYear: latestDate.getUTCFullYear(),
    latestMonth: latestDate.getUTCMonth() + 1,
    randomised,
    certain: latest <= Date.UTC(year, 0, 1),
  };
}
