import { describe, expect, it } from 'vitest';
import { parseSavegame } from '../parse';
import { readSettings } from '../extract/pats';
import { readNewGrfs } from '../extract/ngrf';
import { readGameYear, yearOfDate } from '../extract/date';
import { readInflation } from '../extract/ecmy';
import { fixture } from './fixture';
import type { RawSavegame } from '../read';

const IRON_HORSE = 0x23124143;
const FIRS = 0x100025f1;
const BASE_COSTS = 0x0503474d;

describe('извлечение из настоящего сейва', () => {
  it('настройки читаются по именам, как их зовёт игра', async () => {
    const { chunks } = await parseSavegame(fixture('londworth-1860'));
    const settings = readSettings(chunks.get('PATS'));
    expect(settings.size).toBe(381);
    expect(settings.get('economy.day_length_factor')).toBe(5);
    expect(settings.get('game_creation.starting_year')).toBe(1860);
    expect(settings.get('difficulty.vehicle_costs')).toBe(2);
    expect(settings.get('difficulty.construction_cost')).toBe(2);
    expect(settings.get('difficulty.initial_interest')).toBe(4);
    expect(settings.get('economy.inflation')).toBe(0);
    expect(settings.get('vehicle.max_train_length')).toBe(7);
    expect(settings.get('economy.industry_cargo_scale')).toBe(200);
  });

  it('NewGRF приходят с параметрами игрока', async () => {
    const { chunks } = await parseSavegame(fixture('londworth-1860'));
    const grfs = readNewGrfs(chunks.get('NGRF'));
    const byId = new Map(grfs.map((g) => [g.grfid, g]));
    expect(byId.get(IRON_HORSE)?.params[0]).toBe(2); // вместимость вагонов
    expect(byId.get(FIRS)?.params[0]).toBe(3); // экономика steeltown
    const basecosts = byId.get(BASE_COSTS)!;
    expect(basecosts.name).toBe('BaseCosts Mod 5.0');
    expect(basecosts.params[15]).toBe(9); // locomotive purchase = double
    expect(basecosts.params[16]).toBe(9); // waggon purchase = double
    expect(basecosts.params[42]).toBe(8); // steam running = unchanged
    expect(basecosts.params[43]).toBe(8);
    expect(basecosts.params[44]).toBe(8);
  });

  it('год партии берётся из даты', async () => {
    const { chunks } = await parseSavegame(fixture('londworth-1860'));
    expect(readGameYear(chunks.get('DATE'))).toBe(1860);
    const played = await parseSavegame(fixture('londworth-1975'));
    expect(readGameYear(played.chunks.get('DATE'))).toBe(1975);
  });

  it('накопленная инфляция читается как множитель', async () => {
    const { chunks } = await parseSavegame(fixture('londworth-1860'));
    // инфляция в партии выключена, поэтому множители единичные
    expect(readInflation(chunks.get('ECMY'))).toEqual({ prices: 1, payment: 1 });
  });
});

describe('перевод даты в год', () => {
  it('совпадает с календарём игры на високосных границах', () => {
    expect(yearOfDate(0)).toBe(0);
    expect(yearOfDate(366)).toBe(1); // год 0 високосный
    expect(yearOfDate(679351)).toBe(1860);
    expect(yearOfDate(721555)).toBe(1975);
  });
});

/** Минимальный разобранный сейв: список GRF — единственное, что здесь важно. */
function rawWithGrfs(grfids: number[]): RawSavegame {
  return {
    jgrpp: false,
    version: 0,
    settings: new Map(),
    grfs: grfids.map((grfid) => ({
      grfid, params: [], name: '', filename: '', version: 0,
    })),
    network: {
      engineIds: new Map(),
      engineStates: new Map(),
      industryTypeIds: new Map(),
      trains: new Map(),
      orderLists: new Map(),
      stations: new Map(),
      industries: new Map(),
      towns: new Map(),
      groups: new Map(),
      companies: new Map(),
    },
  };
}

describe('сборка предложения импорта', () => {
  it('из партии Londworth складывается её настоящая конфигурация', async () => {
    const { buildImport } = await import('../import');
    const { readSavegame } = await import('../read');
    const proposal = buildImport(await readSavegame(fixture('londworth-1860')));

    expect(proposal.game).toMatchObject({
      jgrpp: true,
      dayLengthFactor: 5,
      startingYear: 1860,
      vehicleCosts: 2,
      constructionCost: 2,
      inflationInterest: 4,
      inflation: false,
      timekeeping: 'calendar',
      accelerationModel: 'realistic',
      paymentAlgorithm: 'modern',
      trainSet: 'iron_horse',
      firs: true,
      basecostGrf: true,
      // флаг решает, снимает ли игра машины с продажи, поэтому он приходит настройкой,
      // а не строкой справки
      neverExpireVehicles: false,
      // BaseCosts Mod: покупка вдвое дороже, содержание не тронуто
      basecostLocomotive: 2,
      basecostWagon: 2,
      basecostTrainRunningSteam: 1,
      basecostTrainRunningDiesel: 1,
      basecostTrainRunningElectric: 1,
    });
    expect(proposal.calc).toEqual({ priceYear: 1860, capacityIndex: 2 });
    expect(proposal.game.firsEconomy).toBe('STEELTOWN');
    expect(proposal.inflation).toEqual({ prices: 1, payment: 1 });
  });

  it('набор, которого в сейве нет, предлагается выключить', async () => {
    const { buildImport } = await import('../import');
    const { readSavegame } = await import('../read');
    // партия без NewGRF вообще: сейв описывает игру целиком, и отсутствие набора —
    // такое же её свойство, как присутствие
    const proposal = buildImport(await readSavegame(fixture('vanilla-1951')));

    expect(proposal.game).toMatchObject({ trainSet: 'vanilla', firs: false, basecostGrf: false });
  });

  it('валюта и единицы скорости переносятся из партии', async () => {
    // у игры два рубля, и это не синонимы: RUR идёт по 50 к фунту, RUB по 80 — поэтому
    // валюта берётся из сейва, а не остаётся на выборе пользователя. Настройка не про
    // расчёт, но про совпадение с игрой
    const { buildImport } = await import('../import');
    const { readSavegame } = await import('../read');
    const proposal = buildImport(await readSavegame(fixture('londworth-1975')));

    expect(proposal.display).toEqual({ currency: 'RUR', speedUnit: 'metric' });
  });

  it('валюта, которой у калькулятора нет, выбор не трогает', async () => {
    const { displaySettingsFrom } = await import('../mapping');
    // 4 = австрийский шиллинг (currency.h: 4 ATS, 5 BEF): в списке калькулятора его нет,
    // и молча подставлять другую валюту хуже, чем оставить выбранную пользователем
    expect(displaySettingsFrom(new Map([['locale.currency', 4]]))).toEqual({});
    expect(displaySettingsFrom(new Map([['locale.currency', 21]]))).toEqual({ currency: 'RUR' });
    expect(displaySettingsFrom(new Map([['locale.currency', 34]]))).toEqual({ currency: 'RUB' });
    // 2 = SI, 4 = узлы: тоже не наши, выбор остаётся прежним
    expect(displaySettingsFrom(new Map([['locale.units_velocity', 2]]))).toEqual({});
    expect(displaySettingsFrom(new Map([['locale.units_velocity', 0]])))
      .toEqual({ speedUnit: 'imperial' });
  });

  it('сейв без набора машин даёт ваниль, даже когда другие наборы есть', async () => {
    const { buildImport } = await import('../import');
    const { FIRS_GRFID } = await import('../registry');
    const proposal = buildImport(rawWithGrfs([FIRS_GRFID]));
    expect(proposal.game.trainSet).toBe('vanilla');
    expect(proposal.game.firs).toBe(true);
    expect(proposal.recognisedSets).toEqual(['savegame.grf.firs']);
  });

  it('нераспознанный GRF в баннер не попадает', async () => {
    const { buildImport } = await import('../import');
    expect(buildImport(rawWithGrfs([0xdeadbeef])).recognisedSets).toEqual([]);
  });

  it('настройки без модели попадают в справочный список', async () => {
    const { buildImport } = await import('../import');
    const { readSavegame } = await import('../read');
    const proposal = buildImport(await readSavegame(fixture('londworth-1860')));
    const byName = new Map(proposal.info.map((i) => [i.setting.name, i.value]));
    expect(byName.get('economy.industry_cargo_scale')).toBe(200);
    expect(byName.get('vehicle.max_train_length')).toBe(7);
    expect(byName.get('vehicle.train_braking_model')).toBe(1);
    // и ни одна из них не притворяется настройкой калькулятора
    expect(Object.keys(proposal.game)).not.toContain('maxTrainLength');
  });

  it('порядок экономик в данных совпадает с меню параметров FIRS', async () => {
    const { economies } = await import('../../dataset');
    // FIRS нумерует экономики позицией в меню: 3 — это Steeltown
    expect(economies.map((e) => e.id)).toEqual([
      'BASIC_TEMPERATE',
      'BASIC_ARCTIC',
      'BASIC_TROPIC',
      'STEELTOWN',
      'IN_A_HOT_COUNTRY',
    ]);
  });
});
