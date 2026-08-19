import { beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../../state/localeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { speed } from '../format';

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
