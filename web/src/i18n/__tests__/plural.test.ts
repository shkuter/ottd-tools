import { beforeEach, describe, expect, it } from 'vitest';
import { plural, pluralForm } from '../plural';
import { countLabel } from '../../components/format';
import { useLocaleStore } from '../../state/localeStore';

/**
 * The word beside a number agrees with it the way the language agrees it — and with the number
 * as it is shown, not with the value before rounding.
 */
describe('plural', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
  });

  it('gives Russian its three forms and the form of a fraction', () => {
    expect(plural('count.years', 1, 0, 'ru')).toBe('год');
    expect(plural('count.years', 21, 0, 'ru')).toBe('год');
    expect(plural('count.years', 3, 0, 'ru')).toBe('года');
    expect(plural('count.years', 5, 0, 'ru')).toBe('лет');
    expect(plural('count.years', 11, 0, 'ru')).toBe('лет');
    expect(plural('count.years', 1.5, 1, 'ru')).toBe('года');
  });

  it('picks the form by the figure as printed', () => {
    // 1.04 is printed as "1" with one decimal, so the word is the one of 1, not of a fraction
    expect(plural('count.years', 1.04, 1, 'ru')).toBe('год');
  });

  it('gives English one and other', () => {
    expect(plural('count.routes', 1, 0, 'en')).toBe('route');
    expect(plural('count.routes', 2, 0, 'en')).toBe('routes');
    expect(plural('count.routes', 0, 0, 'en')).toBe('routes');
  });

  it('falls back to the other form for a category the dictionary does not name', () => {
    // no language here has "two", so neither dictionary holds it
    expect(pluralForm('count.years', 'two', 'ru')).toBe('года');
    expect(pluralForm('count.years', 'two', 'en')).toBe('years');
  });

  it('writes the number and the word together in the language of the interface', () => {
    useLocaleStore.setState({ locale: 'ru' });
    expect(countLabel('count.years', 1, 1)).toBe('1 год');
    expect(countLabel('count.years', 1.5, 1)).toBe('1,5 года');
    useLocaleStore.setState({ locale: 'en' });
    expect(countLabel('count.routes', 1)).toBe('1 route');
  });
});
