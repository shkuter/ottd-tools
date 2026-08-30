/**
 * Когда машина стоит в списке покупки игры: дата появления точнее года, вдобавок
 * рандомизируется, после неё идёт год ожидания, а с другого конца жизни машину
 * снимают с продажи по срокам, разыгранным из seed партии.
 */
import { describe, expect, it } from 'vitest';
import {
  introAvailability,
  standsInBuyMenu,
  introRandomisationActive,
  retirementBounds,
  vehicleAvailability,
} from '../availability';
import { DEFAULT_GAME_SETTINGS } from '../settings';
import { activeTrains, availabilityContext, trains } from '../../dataset';
import type { Train } from '../../types';

const rat = trains.find((t) => t.id === 'rat')!;
const containerWagon = trains.find((t) => t.id === 'intermodal_car_pony_gen_4B')!;

const vanilla = { ...DEFAULT_GAME_SETTINGS, jgrpp: false };
const jgrpp = { ...DEFAULT_GAME_SETTINGS, jgrpp: true };
const jgrppNoRandom = { ...jgrpp, vehicleIntroRandomisation: false };

describe('данные о датах появления', () => {
  it('Iron Horse разводит машины поколения по месяцам', () => {
    // gen 4 ростера Pony начинается в 1960: контейнерный вагон — с мая,
    // Rat вынесен на год раньше (intro_year_offset = -1) и в декабрь как joker
    expect([containerWagon.intro_year, containerWagon.intro_month]).toEqual([1960, 5]);
    expect([rat.intro_year, rat.intro_month]).toEqual([1959, 12]);
  });
});

describe('introRandomisationActive', () => {
  it('в ванили рандомизация встроена и не отключается', () => {
    expect(introRandomisationActive(vanilla)).toBe(true);
  });

  it('в JGRPP читается настройка', () => {
    expect(introRandomisationActive(jgrpp)).toBe(true);
    expect(introRandomisationActive(jgrppNoRandom)).toBe(false);
  });
});

describe('introAvailability', () => {
  it('машина своего года не гарантирована: она вводится не 1 января', () => {
    const a = introAvailability(containerWagon, 1960, jgrppNoRandom);
    expect(a.certain).toBe(false);
    expect([a.latestYear, a.latestMonth]).toEqual([1960, 5]);
  });

  it('следующий год — ещё не гарантия: после появления идёт год ожидания', () => {
    // 1 мая 1960 + 12 месяцев = 1 мая 1961, то есть 1961-й машина застаёт не с января
    expect(introAvailability(containerWagon, 1961, jgrppNoRandom).certain).toBe(false);
    expect(introAvailability(containerWagon, 1962, jgrppNoRandom).certain).toBe(true);
  });

  it('рандомизация растягивает появление почти на полтора года', () => {
    // 1 мая 1960 + 511 дней = 23 сентября 1961
    const a = introAvailability(containerWagon, 1961, jgrpp);
    expect([a.latestYear, a.latestMonth]).toEqual([1961, 9]);
    expect(a.certain).toBe(false);
    // плюс год ожидания: гарантия наступает только в 1963-м
    expect(introAvailability(containerWagon, 1962, jgrpp).certain).toBe(false);
    expect(introAvailability(containerWagon, 1963, jgrpp).certain).toBe(true);
  });

  it('локомотив года назад тоже под вопросом', () => {
    expect(introAvailability(rat, 1960, jgrpp).certain).toBe(false);
    // без рандомизации остаётся год ожидания: декабрь 1959 + 12 месяцев
    expect(introAvailability(rat, 1960, jgrppNoRandom).certain).toBe(false);
    expect(introAvailability(rat, 1961, jgrppNoRandom).certain).toBe(true);
  });

  it('машина старше партии ждать не обязана', () => {
    // игра выставляет такие машины на продажу с первого дня партии
    const old: Train = { ...rat, intro_year: 1950, intro_month: 1 };
    expect(introAvailability(old, 1950, { ...jgrpp, startingYear: 1950 }).certain).toBe(true);
    // а введённая в ходе партии — ждёт
    const later: Train = { ...rat, intro_year: 1951, intro_month: 1 };
    expect(introAvailability(later, 1951, { ...jgrppNoRandom, startingYear: 1950 }).certain)
      .toBe(false);
  });

  it('старая машина в продаже давно', () => {
    const old: Train = { ...rat, intro_year: 1900, intro_month: 1 };
    expect(introAvailability(old, 1960, jgrpp).certain).toBe(true);
  });
});

describe('границы списания', () => {
  const startedIn = (year: number) => ({ ...jgrppNoRandom, startingYear: year });

  it('срок модели истёк, а машина ещё продаётся', () => {
    // модель на 8 лет: вторая фаза обнуляется, продажа держится минимум 127 месяцев
    const wagon: Train = {
      ...containerWagon, intro_year: 1900, intro_month: 1, model_life: 8, retire_early: 0,
    };
    const ctx = { game: startedIn(1900) };
    expect(vehicleAvailability(wagon, 1909, ctx).state).toBe('available');
    expect(vehicleAvailability(wagon, 1911, ctx).state).toBe('uncertain');
    expect(vehicleAvailability(wagon, 1911, ctx).reason).toBe('retire');
    // верхняя граница: 38 + 15 + 247 = 300 месяцев = 25 лет
    expect(vehicleAvailability(wagon, 1926, ctx).state).toBe('unavailable');
  });

  it('короткий срок модели обнуляет вторую фазу целиком', () => {
    const short: Train = {
      ...containerWagon, intro_year: 1900, intro_month: 1, model_life: 4, retire_early: 0,
    };
    // игра клампит всю сумму, а не только срок модели: у 4 и 6 лет вторая фаза — ровно
    // ноль, разброс в неё не попадает (max(0, rand + life*12 - 96))
    expect(retirementBounds(short)).toEqual({ lower: 127, upper: 285 });
    expect(retirementBounds({ ...short, model_life: 6 })).toEqual({ lower: 127, upper: 285 });
    // с восьми лет разброс уже виден: max(0, 15 + 0)
    expect(retirementBounds({ ...short, model_life: 8 })).toEqual({ lower: 127, upper: 300 });
  });

  it('ранний уход Iron Horse отменяет разброс третьей фазы', () => {
    const ih: Train = {
      ...containerWagon, intro_year: 1900, intro_month: 1, model_life: 8, retire_early: -10,
    };
    // 7 + 0 + 120 и 38 + 15 + 120: верхняя граница перестаёт зависеть от seed
    expect(retirementBounds(ih)).toEqual({ lower: 127, upper: 173 });
  });

  it('настройка «транспорт не выходит из эксплуатации» снимает границы', () => {
    const wagon: Train = {
      ...containerWagon, intro_year: 1900, intro_month: 1, model_life: 8, retire_early: 0,
    };
    const ctx = { game: { ...startedIn(1900), neverExpireVehicles: true } };
    expect(vehicleAvailability(wagon, 2000, ctx).state).toBe('available');
  });

  it('машина, которая не устаревает, границ не имеет', () => {
    expect(retirementBounds({ ...containerWagon, model_life: null })).toBeNull();
  });
});

describe('серия стареет целиком', () => {
  const member: Train = {
    ...rat,
    intro_year: 1872, intro_month: 1, model_life: 8, retire_early: 0,
    variant_group: 'steam:series',
  };
  const groups = {
    'steam:series': { item: 'series', intro_year: 1873, intro_month: 1, buyable: false },
  };
  const game = { ...jgrppNoRandom, startingYear: 1862 };

  it('непокупаемая голова стареет либо с начала партии, либо со своей даты', () => {
    // игра метит такую голову введённой в первый день партии, но при смене набора NewGRF
    // пересчитывает возраст от её собственной даты: в сейвах пользователя встретились оба
    // отсчёта. Пока они расходятся, ответ — «под вопросом», а не «снята»
    const a = vehicleAvailability(member, 1875, { game, groups });
    expect([a.state, a.reason]).toEqual(['uncertain', 'retire']);
    // машина исчезает, только когда и молодой отсчёт (от даты головы) перерос верхнюю границу
    expect(vehicleAvailability(member, 1888, { game, groups }).state).toBe('uncertain');
    expect(vehicleAvailability(member, 1910, { game, groups }).state).toBe('unavailable');
  });

  it('без синхронизации надёжности машина стареет сама', () => {
    // экстрактор оставляет голову пустой, когда набор не просил синхронизацию
    const alone = { ...member, variant_group: null };
    expect(vehicleAvailability(alone, 1875, { game, groups }).state).toBe('available');
  });

  it('непокупаемая голова того же года стареет с начала партии, а не со своей даты', () => {
    // голова декабря 1862-го в партии, начатой в январе того же года: игра метит её
    // введённой в первый день партии, и серия старше на одиннадцать месяцев, чем
    // показало бы сравнение по годам — этих месяцев хватает, чтобы перейти границу
    const decemberHead = {
      'steam:series': { item: 'series', intro_year: 1862, intro_month: 12, buyable: false },
    };
    const context = { game: { ...jgrppNoRandom, startingYear: 1862 }, groups: decemberHead };
    expect(vehicleAvailability(member, 1873, context).state).toBe('uncertain');
  });

  it('покупаемая голова задаёт отсчёт своей датой', () => {
    const buyable = {
      'steam:series': { item: 'series', intro_year: 1873, intro_month: 1, buyable: true },
    };
    // от 1873-го прошло 24 месяца — обе границы далеко впереди
    expect(vehicleAvailability(member, 1875, { game, groups: buyable }).state).toBe('available');
  });

  it('набор без серий ничего не меняет', () => {
    const plain = { ...member, variant_group: null };
    expect(vehicleAvailability(plain, 1875, { game }).state).toBe('available');
  });
});

describe('возраст считается с открытия продажи', () => {
  const wagon = (year: number): Train => ({
    ...containerWagon, intro_year: year, intro_month: 1, model_life: 8, retire_early: 0,
    variant_group: null,
  });

  it('машина, введённая в ходе партии, стареет на год позже своей даты', () => {
    // игра начинает считать возраст, когда открывает продажу всем (intro + год),
    // поэтому нижняя граница (127 месяцев) наступает на год позже даты появления
    const game = { ...jgrppNoRandom, startingYear: 1900 };
    const later = wagon(1910);
    expect(vehicleAvailability(later, 1921, { game }).state).toBe('available');
    expect(vehicleAvailability(later, 1922, { game }).state).toBe('uncertain');
  });

  it('машина того же года, но не января, всё равно ждёт: игра сравнивает даты', () => {
    // партия начинается 1 января, и машина мая того же года на старте ещё не введена —
    // сравнение по годам укоротило бы ей жизнь в продаже на год
    const game = { ...jgrppNoRandom, startingYear: 1900 };
    const may: Train = {
      ...containerWagon, intro_year: 1900, intro_month: 5, model_life: 8, retire_early: 0,
      variant_group: null,
    };
    expect(vehicleAvailability(may, 1911, { game }).state).toBe('available');
    expect(vehicleAvailability(may, 1912, { game }).state).toBe('uncertain');
  });

  it('машина старше партии стареет со своей даты: ждать ей не приходилось', () => {
    const game = { ...jgrppNoRandom, startingYear: 1920 };
    const older = wagon(1910);
    expect(vehicleAvailability(older, 1920, { game }).state).toBe('available');
    expect(vehicleAvailability(older, 1921, { game }).state).toBe('uncertain');
  });
});

describe('машине нечего возить', () => {
  const steeltown = { ...DEFAULT_GAME_SETTINGS, trainSet: 'xussr' as const, firs: true,
    firsEconomy: 'STEELTOWN', startingYear: 1850 };

  it('пищевая цистерна в Steeltown не показывается: возить ей нечего', () => {
    const tanker = activeTrains(steeltown).find((t) => t.id === 'xussr_tanker_type1858w')!;
    const ctx = availabilityContext(steeltown);
    expect(standsInBuyMenu(tanker, 1870, ctx)).toBe(false);
  });

  it('в экономике, где её груз есть, она возвращается', () => {
    const withFood = { ...steeltown, firsEconomy: 'BASIC_TEMPERATE' };
    const tanker = activeTrains(withFood).find((t) => t.id === 'xussr_tanker_type1858w')!;
    expect(standsInBuyMenu(tanker, 1870, availabilityContext(withFood))).toBe(true);
  });

  it('локомотив без вместимости правило не трогает', () => {
    const engine = activeTrains(steeltown).find((t) => t.id === 'xussr_steam_a')!;
    expect(engine.capacities.every((c) => c === 0)).toBe(true);
    expect(standsInBuyMenu(engine, 1865, availabilityContext(steeltown))).toBe(true);
  });

  it('машина, о грузах которой данные молчат, остаётся в списке', () => {
    // Iron Horse объявляет рефит сочленённого локомотива на секциях, и у самой записи
    // каталога его нет: молчание данных — не ответ «ничего не везёт»
    const ih = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true,
      firsEconomy: 'STEELTOWN' };
    const combine = activeTrains(ih).find((t) => t.id === 'brenner_cab')!;
    expect(combine.capacities.some((c) => c !== 0)).toBe(true);
    expect(combine.refit.classes).toEqual([]);
    expect(standsInBuyMenu(combine, combine.intro_year + 3, availabilityContext(ih))).toBe(true);
  });
});

describe('дата головы серии тоже разыграна', () => {
  it('серия держится дольше, потому что голова могла появиться позже своей даты', () => {
    // StartupOneEngine сдвигает дату каждой машины пула, головы в том числе; считать её
    // дату точной значило бы снимать серию с продажи раньше, чем это делает игра
    const member: Train = {
      ...rat, intro_year: 1930, intro_month: 1, model_life: 8, retire_early: 0,
      variant_group: 'set:series',
    };
    const groups = {
      'set:series': { item: 'series', intro_year: 1930, intro_month: 1, buyable: true },
    };
    const game = { ...jgrpp, startingYear: 1900 };
    // нижняя граница 127 месяцев от открытия продажи: без сдвига серия ушла бы под вопрос
    // в 1942-м, а со сдвигом до 511 дней старший отсчёт остаётся тем же, младший — позже
    const at1943 = vehicleAvailability(member, 1943, { game, groups });
    expect(at1943.state).toBe('uncertain');
    const exact = { ...game, vehicleIntroRandomisation: false };
    expect(vehicleAvailability(member, 1957, { game: exact, groups }).state).toBe('unavailable');
    // с рандомизацией верхняя граница отодвигается: младший отсчёт от позднего края
    expect(vehicleAvailability(member, 1957, { game, groups }).state).toBe('uncertain');
  });
});
