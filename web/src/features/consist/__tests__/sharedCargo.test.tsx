/**
 * One cargo for the consist and the trip: the builder's panel computes the capacity for the
 * cargo the income tab prices, and a choice made in either place is the choice in both.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../ConsistPage';
import { activeCargoByLabel, activeCargos } from '../../../dataset';
import { cargoName, sortCargos } from '../../../i18n/names';
import { useLocaleStore } from '../../../state/localeStore';
import { useConsistStore } from '../../../state/consistStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';

function draw() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/consist']}>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/**
 * The panel's cargo field. Found inside the panel rather than by its caption: the catalogue
 * beside it has a "Cargo" column and a cargo filter of its own.
 */
const panelCargo = () =>
  document.querySelector<HTMLInputElement>('.consist-side input.mantine-Select-input')!;

const nameOf = (label: string) =>
  cargoName(activeCargoByLabel(useSettingsStore.getState().game).get(label)!);

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  useRouteStore.setState({ cargoLabel: 'COAL' });
  // an empty builder: the panel then holds no field but the cargo
  useConsistStore.setState({ entries: [] });
});

afterEach(cleanup);

describe('the cargo of the consist panel', () => {
  it('is the cargo the income tab prices', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(panelCargo());
    // options share only the attribute, not a class or a role (see CLAUDE.md on Mantine); the
    // catalogue's own cargo filter lists the same names, so only the panel field's list is read
    const list = await waitFor(() => {
      const found = document.getElementById(panelCargo().getAttribute('aria-controls') ?? '');
      expect(found).toBeTruthy();
      return found!;
    });
    const options = [...list.querySelectorAll<HTMLElement>('[data-combobox-option]')];
    await user.click(options.find((option) => option.textContent === nameOf('PASS'))!);

    expect(useRouteStore.getState().cargoLabel).toBe('PASS');
  });

  it('follows a cargo chosen on the income tab', async () => {
    useRouteStore.setState({ cargoLabel: 'MAIL' });
    draw();
    expect(panelCargo().value).toBe(nameOf('MAIL'));

    act(() => useRouteStore.getState().setCargoLabel('PASS'));

    await waitFor(() => expect(panelCargo().value).toBe(nameOf('PASS')));
  });

  it('gives way to the first cargo of the set when it fell out of it', async () => {
    // the same rule the income tab follows, so the two land on the same cargo
    const first = sortCargos(activeCargos(useSettingsStore.getState().game), 'en')[0];
    useRouteStore.setState({ cargoLabel: 'NOT_IN_THIS_SET' });
    draw();

    await waitFor(() => expect(useRouteStore.getState().cargoLabel).toBe(first.label));
    expect(panelCargo().value).toBe(cargoName(first));
  });
});
