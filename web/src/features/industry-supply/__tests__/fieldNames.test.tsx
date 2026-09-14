/**
 * The fields in the rows of the supply table are named by what they set and by the cargo of
 * their row: a placeholder is not a name, and a column of "not set" fields is indistinguishable.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import IndustrySupplyPage from '../IndustrySupplyPage';
import { activeIndustries, industrySupplyInputs } from '../../../dataset';
import { useIndustrySupplyStore } from '../../../state/industrySupplyStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';

let inputs = 0;

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.getState().setGame('firs', true);
  const game = useSettingsStore.getState().game;
  const industry = activeIndustries(game).find((i) => industrySupplyInputs(game, i.id).length > 0)!;
  inputs = industrySupplyInputs(game, industry.id).length;
  useIndustrySupplyStore.getState().setIndustryId(industry.id);
});

afterEach(cleanup);

describe('the fields of the supply table', () => {
  it('name the value and the cargo of their row', async () => {
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/supply']}>
          <IndustrySupplyPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    const distances = await screen.findAllByRole('textbox', { name: /^Distance for .+/ });
    const outputs = screen.getAllByRole('textbox', { name: /^Source output for .+/ });
    expect(distances).toHaveLength(inputs);
    expect(outputs).toHaveLength(inputs);
    // each names its own row's cargo, so no two in a column share a name
    expect(new Set(distances.map((field) => field.getAttribute('aria-label'))).size).toBe(inputs);
  });
});
