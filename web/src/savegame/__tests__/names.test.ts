import { describe, expect, it } from 'vitest';
import { englishOriginalTownName, stationDisplayName } from '../names';
import { stationName } from '../display';
import { useLocaleStore } from '../../state/localeStore';
import { buildSnapshot } from '../snapshot';
import { readSavegame } from '../read';
import { fixture } from './fixture';

describe('генератор имён English Original', () => {
  it('повторяет игру на эталонных сидах', () => {
    // те же эталоны, что в pipeline/tests/test_town_names.py
    expect(englishOriginalTownName(0x0)).toBe('Invenville');
    expect(englishOriginalTownName(0x499602d2)).toBe('Fladingbury');
    expect(englishOriginalTownName(0xdeadbeef)).toBe('Sleburg');
    expect(englishOriginalTownName(0xffffffff)).toBe('Fort Wenfingburg Springs');
  });

  it('города партии Londworth называются как в игре', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('londworth-1975')));
    const names = snapshot.towns.map((t) => t.name);
    expect(names).toContain('Londworth');
    expect(names).toContain('Plennpool');
    expect(names).not.toContain(null);
  });
});

describe('имена станций', () => {
  it('суффикс игры следует языку', () => {
    const parts = { customName: '', suffixKey: 'STR_SV_STNAME_WOODS', nameNumber: 0 };
    expect(stationDisplayName(parts, 'Londworth', 'en')).toBe('Londworth Woods');
    expect(stationDisplayName(parts, 'Londworth', 'ru')).toBe('Londworth Лесная');
  });

  it('индустрийный суффикс FIRS: «Печь» по-русски, Furnace по-английски', () => {
    const parts = { customName: '', suffixKey: 'STR_STATION_FURNACE', nameNumber: 0 };
    expect(stationDisplayName(parts, 'Londworth', 'en')).toBe('Londworth Furnace');
    expect(stationDisplayName(parts, 'Londworth', 'ru')).toBe('Londworth Печь');
  });

  it('переименованная станция выводится строкой как есть', () => {
    const parts = { customName: 'Plenpool Порт', suffixKey: null, nameNumber: 0 };
    expect(stationDisplayName(parts, 'Plennpool', 'ru')).toBe('Plenpool Порт');
  });

  it('станции партии получают игровые имена', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('londworth-1975')));
    const towns = new Map(snapshot.towns.map((t) => [t.id, t]));
    useLocaleStore.getState().setLocale('ru');
    // через тот же путь, которым имена берёт интерфейс
    const names = snapshot.stations.map((s) => stationName(s, towns));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).not.toBe('');
    // индустрийное имя вида «Город Печь» существует в этой партии
    expect(names.some((n) => / Печь$/.test(n))).toBe(true);
  });
});
