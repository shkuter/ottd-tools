/**
 * The settings of a game come from the game first and are edited by hand second, so the
 * import stands ahead of what it fills in.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsPage from '../SettingsPage';
import { t } from '../../../i18n';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('ru');
});

afterEach(cleanup);

describe('the settings screen', () => {
  it('offers the import before the settings it fills in', async () => {
    render(
      <MantineProvider forceColorScheme="dark">
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    const legends = [...document.querySelectorAll('.settings-group legend')].map(
      (legend) => legend.textContent ?? '',
    );
    const importSection = legends.indexOf(t('savegame.title'));
    const newgrfSection = legends.indexOf(t('settings.newgrf'));

    expect(importSection, 'the settings screen shows no import section').toBe(0);
    // every other section is something the import fills in, starting with the sets
    expect(newgrfSection).toBeGreaterThan(importSection);
    expect(legends.length).toBeGreaterThan(2);
  });
});
