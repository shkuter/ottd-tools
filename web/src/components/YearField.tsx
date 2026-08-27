import { NumberInput } from '@mantine/core';
import { fieldWidth } from '../skin';
import { t } from '../i18n';
import { useSettingsStore } from '../state/settingsStore';
import { useYearField } from './useYearField';

/** The calculation year as the tabs offer it, under the label their other filters use. */
export function YearField() {
  const year = useSettingsStore((s) => s.calc.priceYear);
  const setCalc = useSettingsStore((s) => s.setCalc);
  const field = useYearField(year, (value) => setCalc('priceYear', value));

  return <NumberInput {...fieldWidth('narrow')} label={t('consist.filter.year')} {...field} />;
}
