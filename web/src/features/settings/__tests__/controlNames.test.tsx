/**
 * Every control on the settings tab is named by the setting it changes. The rows hold selects,
 * number fields and switches, and a switch is captioned with its own state — read out alone,
 * "off, switch" names nothing.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsPage from '../SettingsPage';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';

function draw() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

const ROLES = ['combobox', 'switch', 'spinbutton', 'textbox'] as const;

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  // every group open, so every row the tab can show is drawn
  useSettingsStore.getState().setGame('jgrpp', true);
});

afterEach(cleanup);

describe('the controls of the settings tab', () => {
  it('have a name, every one of them', () => {
    draw();
    const nameless = ROLES.flatMap((role) =>
      screen.queryAllByRole(role, { name: (name) => name.trim() === '' }),
    );
    expect(nameless.map((element) => element.outerHTML.slice(0, 120))).toEqual([]);
  });

  it('name a switch in a row after the setting, and describe it with the hint', () => {
    draw();
    const row = [...document.querySelectorAll('.setting-row')].find(
      (candidate) => candidate.querySelector('[role="switch"]') && candidate.querySelector('.setting-hint'),
    );
    expect(row, 'no row with a switch and a hint to look at').toBeTruthy();
    const caption = row!.querySelector('.setting-label > span')!.textContent!;
    const hint = row!.querySelector('.setting-hint')!.textContent!;

    const control = screen.getByRole('switch', { name: caption });
    const described = control.getAttribute('aria-describedby');
    expect(described && document.getElementById(described)?.textContent).toBe(hint);
  });

  it('leave the stepper arrows of a number field alone', () => {
    draw();
    expect(document.querySelectorAll('.mantine-NumberInput-control').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.mantine-NumberInput-control[aria-labelledby]')).toHaveLength(0);
  });
});
