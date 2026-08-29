import { beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../../state/localeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { engineLabel, consistLabel, speed, wagonLabel } from '../format';
import { xussrTrains } from '../../dataset';
import { trainName } from '../../i18n/names';

describe('format.speed', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
  });

  it('метрическая система считает километры из внутренней скорости, а не из миль', () => {
    useSettingsStore.setState({ speedUnit: 'metric' });
    // Firebird: 112 миль/ч в игре = 180 внутр. ед. = 181 км/ч (прямой перевод дал бы 180)
    expect(speed(180)).toBe('181 km/h');
  });

  it('английская система показывает те же мили, что и список покупки игры', () => {
    useSettingsStore.setState({ speedUnit: 'imperial' });
    expect(speed(180)).toBe('112 mph');
  });

  it('единица берётся из выбранного языка', () => {
    useLocaleStore.setState({ locale: 'ru' });
    useSettingsStore.setState({ speedUnit: 'metric' });
    expect(speed(64)).toBe('64 км/ч');
    useSettingsStore.setState({ speedUnit: 'imperial' });
    expect(speed(64)).toBe('40 миль/ч');
  });
});

describe('подписи состава называют машину так же, как её видит игрок', () => {
  // строки выдачи подбора и вкладка снабжения пишутся отсюда, а чекбоксы «под вопросом»
  // и каталог — через trainName: разойдись они, одна машина звалась бы в подборе двояко
  const engine = xussrTrains.find((t) => t.kind === 'engine')!;
  const wagon = xussrTrains.find((t) => t.kind === 'wagon')!;
  const row = { engine, engineCount: 2, wagon, wagonCount: 11 };

  it('на русском берут имя из словаря набора', () => {
    useLocaleStore.setState({ locale: 'ru' });
    expect(trainName(engine)).not.toBe(engine.name);
    expect(engineLabel(row)).toBe(`2× ${trainName(engine)}`);
    expect(wagonLabel(row)).toBe(`11× ${trainName(wagon)}`);
    expect(consistLabel(row)).toBe(`${engineLabel(row)} + ${wagonLabel(row)}`);
  });

  it('на английском — имя самого набора', () => {
    useLocaleStore.setState({ locale: 'en' });
    expect(engineLabel(row)).toBe(`2× ${engine.name}`);
  });

  it('один локомотив идёт без счётчика', () => {
    useLocaleStore.setState({ locale: 'ru' });
    expect(engineLabel({ ...row, engineCount: 1 })).toBe(trainName(engine));
  });
});
