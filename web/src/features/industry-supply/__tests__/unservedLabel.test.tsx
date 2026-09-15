/**
 * An input whose route is set but that nothing in the buy menu can haul is labelled for what it
 * is — "nothing can haul it" — rather than "falls out of the window", which promises that a more
 * frequent fleet would fix it. The label is the only thing that differs: the input still counts
 * as missing the window for the conversion and the summary (inputs.test.ts, summary.test.ts).
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import IndustrySupplyPage from '../IndustrySupplyPage';
import { activeIndustries, industrySupplyInputs } from '../../../dataset';
import { t } from '../../../i18n';
import { inputKey, useIndustrySupplyStore } from '../../../state/industrySupplyStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';

let key = '';

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.getState().setGame('firs', true);
  const game = useSettingsStore.getState().game;
  const industry = activeIndustries(game).find((i) => industrySupplyInputs(game, i.id).length > 0)!;
  const [first] = industrySupplyInputs(game, industry.id);
  key = inputKey(industry.id, first.cargoLabel);
  useIndustrySupplyStore.getState().setIndustryId(industry.id);
});

afterEach(cleanup);

/** The state column of every row, as the page writes it. */
const states = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => row.lastElementChild!);

describe('an input nothing can haul', () => {
  it('is labelled so, and coloured as a missed input', async () => {
    // a year before any vehicle of the set: a route can be stated, but nothing runs on it
    act(() => {
      useSettingsStore.setState((state) => ({ calc: { ...state.calc, priceYear: 1800 } }));
      useIndustrySupplyStore.getState().setInput(key, { distanceTiles: 50, productionPerMonth: 100 });
    });
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/supply']}>
          <IndustrySupplyPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    await waitFor(() =>
      expect(states().map((cell) => cell.textContent)).toContain(t('supply.state.unserved')),
    );
    const cell = states().find((c) => c.textContent === t('supply.state.unserved'))!;
    expect(cell.textContent).toBe('nothing can haul it');
    expect(cell.classList.contains('supply-misses')).toBe(true);
    // the rows with no route at all stay "not set", not "nothing can haul it"
    expect(states().some((c) => c.textContent === t('supply.state.unset'))).toBe(true);
    expect(states().some((c) => c.textContent === t('supply.state.misses'))).toBe(false);
  });
});
