/**
 * The time in transit on the route income tab says where it comes from: worked out from the
 * consist, or typed by hand. The way back to the consist's time stands at the field and only
 * while there is a typed time to go back from. The explanation of the model folds under the
 * profitability panel, and the words beside the figures agree with them.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RoutePage from '../RoutePage';
import { trains } from '../../../dataset';
import { t } from '../../../i18n';
import { plural } from '../../../i18n/plural';
import { useConsistStore } from '../../../state/consistStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { useUiStore } from '../../../state/uiStore';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

// a consist that carries coal at a profit in 1950, so the payback has a figure to agree with
const engine = trains.find((train) => train.id === 'buffalo')!;
const hopper = trains.find((train) => train.id === 'bulk_cargo_mixed_combos_pony_gen_1A')!;

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <RoutePage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
    calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'RAIL', priceYear: 1950 },
  });
  useConsistStore.setState({
    entries: [
      { train: engine, count: 1 },
      { train: hopper, count: 10 },
    ],
  });
  useRouteStore.getState().setCargoLabel('COAL');
  useRouteStore.getState().setDistanceTiles(100);
  useRouteStore.getState().setManualDays(null);
  useUiStore.setState({ howComputedOpen: {} });
});

afterEach(cleanup);

const field = () => screen.getByLabelText(t('route.days')) as HTMLInputElement;
const fieldRoot = () => field().closest('.mantine-InputWrapper-root')!;
const description = () =>
  fieldRoot().querySelector('.mantine-InputWrapper-description')?.textContent ?? '';
const backButton = () =>
  screen.queryByRole('button', { name: new RegExp(`^${t('route.daysFromConsist')}:`) });

describe('the time in transit', () => {
  it('says it follows the consist, and offers nothing to go back to', () => {
    draw();
    expect(description()).toMatch(/^From consist speed, /);
    expect(backButton()).toBeNull();
  });

  it('says a typed time is typed, and puts the way back right after the field', async () => {
    draw();
    const user = userEvent.setup();
    await user.clear(field());
    await user.type(field(), '30');

    expect(useRouteStore.getState().manualDays).toBe(30);
    expect(description()).toBe(t('route.daysManual'));
    const button = backButton();
    expect(button).not.toBeNull();
    expect(fieldRoot().nextElementSibling).toBe(button);

    await user.click(button!);
    expect(useRouteStore.getState().manualDays).toBeNull();
    expect(backButton()).toBeNull();
    expect(description()).toMatch(/^From consist speed, /);
  });

  it('says there is no consist to follow when none is built', () => {
    useConsistStore.setState({ entries: [] });
    draw();
    expect(description()).toBe(t('route.daysNoConsist'));
    expect(backButton()).toBeNull();
  });
});

describe('the profitability panel', () => {
  it('folds the model of the trip, and keeps the pointer to the network tab in view', async () => {
    draw();
    const assumptions = screen.getByText(t('combined.assumptions'));
    expect(assumptions).not.toBeVisible();
    expect(screen.getByRole('link', { name: t('nav.network') })).toBeVisible();
    expect(screen.getByText(t('route.productionHint'))).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: t('howComputed.title') }));
    await waitFor(() => expect(assumptions).toBeVisible());
  });

  it('agrees the word of the payback with the figure shown, in Russian', () => {
    useLocaleStore.setState({ locale: 'ru' });
    draw();
    const row = [...document.querySelectorAll('tr')].find((tr) =>
      tr.textContent?.startsWith(t('combined.payback')),
    );
    const figure = row?.querySelector('.cell-num')?.textContent?.replace(/\s/g, ' ') ?? '';
    const match = /^([\d ]+(?:,\d)?) (\S+)$/.exec(figure);
    expect(match, `payback reads "${figure}"`).not.toBeNull();
    const value = Number(match![1].replace(/ /g, '').replace(',', '.'));
    expect(match![2]).toBe(plural('count.years', value, 1, 'ru'));
  });
});
