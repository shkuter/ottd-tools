import { describe, expect, it } from 'vitest';
import {
  MAX_BACKLOG,
  visitClearsFlow,
  RATING_PERIOD_DAYS,
  effectiveRatingPeriodDays,
  estimateStationRating,
  ratingPeriods,
  speedRating,
  vehicleAgeRating,
  waitTimeRating,
  waitTimeThresholdDays,
  waitingCargoRating,
} from '../rating';

describe('station rating parts', () => {
  it('период счётчика — 185 тиков = 2.5 дня', () => {
    expect(RATING_PERIOD_DAYS).toBe(2.5);
  });

  it('замедление экономики JGRPP растягивает период', () => {
    expect(effectiveRatingPeriodDays(1)).toBe(2.5); // ваниль: счётчик тикает каждый тик
    expect(effectiveRatingPeriodDays(5)).toBe(12.5);
  });

  it('скорость: (last_speed - 85) >> 2, ниже 85 — ноль', () => {
    expect(speedRating(85)).toBe(0);
    expect(speedRating(60)).toBe(0);
    expect(speedRating(96)).toBe(2); // 60 mph
    expect(speedRating(255)).toBe(42);
    expect(speedRating(400)).toBe(42); // last_speed хранится в байте
  });

  it('время с последней погрузки: ступени 3 / 6 / 12 / 21 периодов', () => {
    expect(waitTimeRating(3)).toBe(130);
    expect(waitTimeRating(6)).toBe(95);
    expect(waitTimeRating(12)).toBe(50);
    expect(waitTimeRating(21)).toBe(25);
    expect(waitTimeRating(22)).toBe(0);
    expect(waitTimeRating(83)).toBe(0); // круг 208 дней при одном поезде
  });

  it('те же ступени в днях едут вместе с множителем длины дня', () => {
    // подсказка колонки «Интервал» берёт пороги отсюда, а не своим списком чисел
    expect(waitTimeThresholdDays(1)).toEqual([52.5, 30, 15, 7.5]);
    expect(waitTimeThresholdDays(5)).toEqual([262.5, 150, 75, 37.5]);
    for (const days of waitTimeThresholdDays(5)) {
      // порог ещё в своей ступени, а один период сверх него уже в следующей
      const atThreshold = waitTimeRating(ratingPeriods(days, 5));
      expect(atThreshold).toBeGreaterThan(0);
      expect(waitTimeRating(ratingPeriods(days + 12.5, 5))).toBeLessThan(atThreshold);
    }
  });

  it('ждущий груз: от +40 при пустой станции до -90 при завале', () => {
    expect(waitingCargoRating(0)).toBe(40);
    expect(waitingCargoRating(100)).toBe(40);
    expect(waitingCargoRating(300)).toBe(30);
    expect(waitingCargoRating(1000)).toBe(0);
    expect(waitingCargoRating(1501)).toBe(-90);
  });

  it('возраст: JGRPP прощает старую технику, ваниль — нет', () => {
    expect(vehicleAgeRating(0, false)).toBe(33);
    expect(vehicleAgeRating(5, false)).toBe(0);
    expect(vehicleAgeRating(5, true)).toBe(33);
    expect(vehicleAgeRating(25, true)).toBe(10);
    expect(vehicleAgeRating(30, true)).toBe(0);
  });
});

describe('оценка рейтинга станции', () => {
  const base = {
    maxSpeedInternal: 96, // 60 mph
    cargoPerDay: 2304 / (365 * 5), // 192 ящика в экономический месяц, day length 5
    visitCapacity: Infinity, // парк вывозит всё накопленное — допущение до этой правки
    jgrpp: true,
    dayLengthFactor: 1,
  };

  it('редкие заходы дают низкий вывоз, частые — высокий', () => {
    const rare = estimateStationRating({ ...base, pickupIntervalDays: 208 });
    const often = estimateStationRating({ ...base, pickupIntervalDays: 208 / 8 });
    expect(rare.deliveredShare).toBeLessThan(0.6);
    expect(often.deliveredShare).toBeGreaterThan(rare.deliveredShare + 0.2);
  });

  it('на длинном интервале бонус за ожидание почти теряется', () => {
    const r = estimateStationRating({ ...base, pickupIntervalDays: 208 });
    // ступени действуют только первые 21 период после захода — в среднем по кругу
    // остаются крохи от максимальных 130
    expect(r.parts.waitTime).toBeLessThan(20);
    expect(estimateStationRating({ ...base, pickupIntervalDays: 7 }).parts.waitTime)
      .toBeGreaterThan(100);
    expect(r.parts.age).toBe(33);
    expect(r.parts.speed).toBe(2);
  });

  it('доля отдачи — (рейтинг + 1) / 256', () => {
    const r = estimateStationRating({ ...base, pickupIntervalDays: 40 });
    expect(r.deliveredShare).toBeCloseTo((r.rating + 1) / 256, 10);
    expect(r.rating).toBeGreaterThanOrEqual(0);
    expect(r.rating).toBeLessThanOrEqual(255);
  });

  it('множитель длины дня укладывает интервал в меньшее число периодов', () => {
    // Партия из proposal.md: ферросплавы, круг 179,5 дня, 2 поезда, множитель 5.
    const party = { ...base, cargoPerDay: (510 * 12) / (365 * 5), pickupIntervalDays: 179.5 / 2 };
    const slow = estimateStationRating({ ...party, dayLengthFactor: 5 });
    const plain = estimateStationRating(party);

    // 89,75 дня — это 7 периодов по 12,5 дня против 36 периодов по 2,5:
    // среднее по ступеням 3/6/12/21 пиннит и то, и другое число
    expect(slow.parts.waitTime).toBeCloseTo(725 / 7, 10);
    expect(plain.parts.waitTime).toBeCloseTo(1200 / 36, 10);
    expect(slow.deliveredShare).toBeCloseTo(0.696, 3);
    expect(plain.deliveredShare).toBeCloseTo(0.427, 3);
  });

  it('доля сходится с эталоном партии, а без множителя — нет', () => {
    // В игре на той же партии 72 % перевезено при рейтинге 73 %. Точный состав неизвестен
    // (по разнице рейтингов он был быстрее базы в 60 mph), поэтому эталон проверяется с
    // допуском: важно, что растянутый период попадает в окрестность игрового числа, а
    // период в 2,5 дня промахивается втрое дальше — ради этого изменение и делалось.
    const party = { ...base, cargoPerDay: (510 * 12) / (365 * 5), pickupIntervalDays: 179.5 / 2 };
    const GAME = 0.72;
    const slow = estimateStationRating({ ...party, dayLengthFactor: 5 });
    const plain = estimateStationRating(party);

    expect(Math.abs(slow.deliveredShare - GAME)).toBeLessThan(0.05);
    expect(Math.abs(plain.deliveredShare - GAME)).toBeGreaterThan(0.25);
  });

  it('при множителе 1 числа те же, что и до его появления', () => {
    // Ванильная ветка (jgrpp: false, множитель 1) не должна поехать: значение снято с версии
    // формулы до правки дня длины. Допуск в сотую единицы рейтинга — с тех пор доля стала
    // читаться в точке баланса, а не на ступени под ней, и это сдвинуло её на 0,005.
    const r = estimateStationRating({ ...base, pickupIntervalDays: 40, dayLengthFactor: 1 });
    expect(r.rating).toBeCloseTo(142.1875, 2);
  });

  it('статуя и свежий поезд поднимают рейтинг', () => {
    const plain = estimateStationRating({ ...base, pickupIntervalDays: 30 });
    const withStatue = estimateStationRating({ ...base, pickupIntervalDays: 30, statue: true });
    // Точность поиска доли, а не равенство до бита: рейтинг выводится из доли, и у двух
    // маршрутов граница баланса находится с точностью до `SHARE_EPSILON`.
    expect(withStatue.rating).toBeCloseTo(plain.rating + 26, 1);
  });
});

describe('остаток, который парк не вывозит', () => {
  // Стенд из proposal.md: шахта 405 т/мес, три поезда, круг 199,4 дня, множитель 5.
  const base = {
    maxSpeedInternal: 96,
    cargoPerDay: (405 * 12) / (365 * 5),
    pickupIntervalDays: 199.4 / 3,
    jgrpp: true,
    dayLengthFactor: 5,
    visitCapacity: Infinity,
  };
  /** Сколько приходит на станцию между визитами при посчитанной доле. */
  const arrives = (r: { deliveredShare: number }) =>
    base.cargoPerDay * r.deliveredShare * base.pickupIntervalDays;

  it('парк вывозит весь поток — числа те же, что и до правки', () => {
    const clears = estimateStationRating(base);
    const enough = estimateStationRating({ ...base, visitCapacity: arrives(clears) + 1 });
    expect(enough).toEqual(clears);
    expect(enough.backlog).toBe(0);
  });

  it('парк отстаёт — на станции стоит остаток, рейтинг ниже', () => {
    const clears = estimateStationRating(base);
    const behind = estimateStationRating({ ...base, visitCapacity: arrives(clears) / 2 });
    expect(behind.backlog).toBeGreaterThan(0);
    expect(behind.rating).toBeLessThan(clears.rating);
    // Просаживает именно штраф за ждущий груз: время с погрузки от парка не зависит.
    expect(behind.parts.waitingCargo).toBeLessThan(clears.parts.waitingCargo);
    expect(behind.parts.waitTime).toBe(clears.parts.waitTime);
  });

  it('остаток встаёт там, где приход сравнялся с вывозом', () => {
    // Это и есть выход равновесия: не «сколько успели насчитать за N проходов», а точка, в
    // которой станции предлагают ровно столько, сколько парк увозит. Найденный остаток
    // проверяется с двух сторон — равновесие держится, и лишнего в нём нет: парк, которому
    // не хватило самой малости, копит меньше того, кому не хватает вдвое. В ноль у границы
    // остаток не сходит: штраф за ждущий груз меняется ступенями, и равновесие встаёт на
    // первой ступени, которая его удерживает.
    const clears = estimateStationRating(base);
    const full = arrives(clears);
    const behind = estimateStationRating({ ...base, visitCapacity: full / 2 });
    expect(arrives(behind)).toBeLessThanOrEqual(full / 2 + 1e-9);

    expect(estimateStationRating({ ...base, visitCapacity: full * 1.001 }).backlog).toBe(0);
    const barely = estimateStationRating({ ...base, visitCapacity: full * 0.999 });
    expect(barely.backlog).toBeGreaterThan(0);
    expect(barely.backlog).toBeLessThan(behind.backlog);
  });

  it('вдвое меньший парк роняет рейтинг сильнее, но не ниже минимального штрафа', () => {
    const clears = estimateStationRating(base);
    const half = estimateStationRating({ ...base, visitCapacity: arrives(clears) / 2 });
    const quarter = estimateStationRating({ ...base, visitCapacity: arrives(clears) / 4 });
    const nothing = estimateStationRating({ ...base, visitCapacity: 0 });
    expect(quarter.rating).toBeLessThan(half.rating);
    expect(quarter.rating).toBeGreaterThanOrEqual(nothing.rating);
    // Дальше рейтинг от завала не зависит: штраф уже на полу, остаток упёрся в потолок.
    expect(nothing.backlog).toBe(MAX_BACKLOG);
    expect(nothing.parts.waitingCargo).toBe(-90);
    expect(estimateStationRating({ ...base, visitCapacity: 0.001 }).rating).toBe(nothing.rating);
  });

  it('равновесие находится на всём диапазоне, а не досчитывается за фиксированные проходы', () => {
    // Поиск остатка обязан приходить в одну и ту же точку независимо от того, сколько на неё
    // потрачено проходов: инвариант равновесия — к приезду поезда станции отдали не больше,
    // чем он увозит. Проверяется на сетке, где сходимость заведомо разной длины: короткий
    // интервал против длинного (число периодов внутри оценки отличается на два порядка) и
    // парк от «увозит сотую часть потока» до «увозит вдвое больше».
    for (const pickupIntervalDays of [12.5, 62.5, 250, 1250]) {
      const at = (visitCapacity: number) =>
        estimateStationRating({ ...base, pickupIntervalDays, visitCapacity });
      const full = base.cargoPerDay * at(Infinity).deliveredShare * pickupIntervalDays;
      for (const share of [0.01, 0.1, 0.5, 0.9, 0.99, 1.01, 2]) {
        const visitCapacity = full * share;
        const r = at(visitCapacity);
        const arrives = base.cargoPerDay * r.deliveredShare * pickupIntervalDays;
        // Либо парк справляется и остатка нет, либо остаток встал там, где приход перестал
        // обгонять вывоз, либо он упёрся в потолок, за которым игра его уже не считает.
        if (r.backlog === 0) {
          expect(arrives).toBeLessThanOrEqual(visitCapacity + 1e-9);
        } else if (r.backlog >= MAX_BACKLOG) {
          // Потолок: штраф на полу, дальше станцию не опустить, и приход обгоняет вывоз
          // сколько угодно — куча просто растёт.
          expect(r.parts.waitingCargo).toBe(-90);
        } else if (r.rating === 0) {
          // Пол доли: 1/256 выпуска игра отдаёт даже при нулевом рейтинге, и если парку мало
          // даже этого, равновесия тоже нет.
          expect(r.deliveredShare).toBeCloseTo(1 / 256, 12);
        } else {
          expect(arrives).toBeLessThanOrEqual(visitCapacity + 0.5);
        }
        // И результат не зависит от того, в каком порядке его спросили.
        expect(at(visitCapacity)).toEqual(r);
      }
    }
  });

  it('больший источник не уменьшает вывоз', () => {
    // Слагаемые рейтинга ступенчаты, а шаг доли — 1/256 выпуска: на крупном предприятии одна
    // ступень стоит десятков тонн. Если брать ступень, а не равновесие, тот же парк начинает
    // вывозить тем меньше, чем больше источник, — в игре такого не бывает.
    const interval = 100;
    const visitCapacity = 50;
    const perVisit = (cargoPerDay: number) => {
      const r = estimateStationRating({
        ...base,
        cargoPerDay,
        pickupIntervalDays: interval,
        dayLengthFactor: 1,
        visitCapacity,
      });
      return { hauled: cargoPerDay * r.deliveredShare * interval, backlog: r.backlog };
    };

    let previous = 0;
    // Сетка густая и доходит до потоков, на которых прежняя оценка — итерация в пять проходов
    // — раскачивалась и садилась на 1/256: там вывоз падал вдвое против вдвое меньшего
    // источника. Редкая сетка такое пропускает: точка баланса стоит на границе ступени штрафа,
    // и просадка видна только у самого перехода.
    for (let perYear = 400; perYear <= 500000; perYear *= 1.05) {
      const { hauled, backlog } = perVisit(perYear / 365);
      // Больше вместимости визит не увезёт, а меньше — только если источник мельче. На
      // переходе через ступень допускается просадка в пределах процента: убрать её вовсе
      // может лишь симуляция колебания рейтинга по тикам, которой в оценке нет.
      const moved = Math.min(hauled, visitCapacity);
      expect(moved).toBeGreaterThanOrEqual(Math.min(previous, visitCapacity) * 0.99);
      // Переполненная станция отдаёт ровно то, что увозит визит: поезд уходит полным.
      if (backlog > 0 && hauled <= visitCapacity) expect(hauled).toBeCloseTo(visitCapacity, 9);
      previous = hauled;
    }
  });

  it('доля наружу — та же, по которой решается судьба остатка', () => {
    // Оптимизатор кэширует рейтинг двумя ярусами: дешёвый ключ отдаётся, если по показанной
    // доле визит увозит весь приход. Ярусы сходятся ровно потому, что доля, отданная наружу,
    // совпадает с той, по которой оценка решала, копиться ли остатку. Стоит рейтингу начать
    // округляться — и они разъедутся молча, поэтому равенство проверяется здесь.
    for (const dayLengthFactor of [1, 5]) {
      for (const pickupIntervalDays of [8, 40, 200]) {
        for (const perYear of [3000, 60000, 400000]) {
          const cargoPerDay = perYear / (365 * dayLengthFactor);
          for (const share of [0.2, 0.9, 1, 1.5]) {
            const free = estimateStationRating({
              ...base, cargoPerDay, pickupIntervalDays, dayLengthFactor, visitCapacity: Infinity,
            });
            const visitCapacity = cargoPerDay * free.deliveredShare * pickupIntervalDays * share;
            const r = estimateStationRating({
              ...base, cargoPerDay, pickupIntervalDays, dayLengthFactor, visitCapacity,
            });
            // Первый ярус кэша — рейтинг без ограничения по вместимости; он отдаётся строке,
            // если по нему визит увозит весь приход. Значит именно этот вердикт обязан
            // совпадать с тем, нашла ли оценка остаток.
            expect(
              visitClearsFlow({
                cargoPerDay,
                deliveredShare: free.deliveredShare,
                pickupIntervalDays,
                visitCapacity,
              }),
            ).toBe(r.backlog === 0);
            // А доля, отданная наружу, при остатке ровно упирается во вместимость визита —
            // пока равновесие вообще достижимо: не на полу доли и не на потолке остатка.
            if (r.backlog > 0 && r.backlog < MAX_BACKLOG && r.rating > 0) {
              expect(cargoPerDay * r.deliveredShare * pickupIntervalDays).toBeCloseTo(
                visitCapacity,
                6,
              );
            }
          }
        }
      }
    }
  });

  it('слагаемые вместе с поправкой дают показанный рейтинг', () => {
    // Подсказка в колонке рейтинга перечисляет слагаемые и итог: если они не сходятся,
    // пользователь видит арифметику, которая не сходится.
    for (const share of [2, 1, 0.5, 0.2, 0.05, 0.001]) {
      const clears = estimateStationRating({ ...base, visitCapacity: Infinity });
      const full = arrives(clears);
      const r = estimateStationRating({ ...base, visitCapacity: full * share });
      const { speed, waitTime, waitingCargo, age, statue, swing } = r.parts;
      expect(speed + waitTime + waitingCargo + age + statue + swing).toBeCloseTo(
        r.rating,
        9,
      );
    }
  });

  it('эталон партии: шахта 405 т/мес и три состава по 120 т', () => {
    // Сейв «Nonnville Transport, 1955-02-26» (JGRPP, множитель длины дня 5, Steeltown):
    // шахта 405 т/мес, три состава Athena + 6 Coal Wagon по 20 т, круг 199,4 дня. В самом
    // сейве у станции rating 175 (то есть 69 %, как показывает игра), max_waiting_cargo 318
    // — при ручном распределении это половина платформы, то есть около 636 т ждущего груза,
    // last_speed 96, поездам по 4 года.
    const bench = { ...base, visitCapacity: 6 * 20, vehicleAgeYears: 4 };
    const GAME_SHARE = (175 + 1) / 256;
    const r = estimateStationRating(bench);

    // Допуск, а не точное совпадение: игра сохраняет мгновенный рейтинг (на снимке — сразу
    // после погрузки, в лучшей точке цикла), а оценка даёт равновесное среднее по кругу.
    // Промах — около процентного пункта, то есть меньше трёх рейтинговых единиц из 255.
    expect(Math.abs(r.deliveredShare - GAME_SHARE)).toBeLessThan(0.015);
    // Остаток того же порядка, что стоял на платформе в партии.
    expect(r.backlog).toBeGreaterThan(400);
    expect(r.backlog).toBeLessThan(900);

    // Ради этого правка и делалась: оценка, считающая, что состав увозит всё накопленное,
    // промахивается мимо игры дальше — и в другую сторону.
    const ignoringFleet = estimateStationRating({ ...bench, visitCapacity: Infinity });
    expect(ignoringFleet.deliveredShare - GAME_SHARE).toBeGreaterThan(0.06);
    expect(Math.abs(ignoringFleet.deliveredShare - GAME_SHARE)).toBeGreaterThan(
      Math.abs(r.deliveredShare - GAME_SHARE),
    );
  });

  it('рейтинг растёт с вместимостью визита монотонно', () => {
    const clears = estimateStationRating(base);
    const full = arrives(clears);
    let previous = -1;
    for (const share of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 1.5]) {
      const r = estimateStationRating({ ...base, visitCapacity: full * share });
      // Допуск: доля ищется делением отрезка, поэтому соседние вместимости сходятся к одному
      // рейтингу с точностью до последнего бита, а не побитово одинаково.
      expect(r.rating).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = r.rating;
    }
    expect(previous).toBe(clears.rating);
  });
});
