/**
 * The table of contents of the settings tab: one link per group, in the order of the page,
 * each pointing at a group that is there and captioned as the group is.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage';
import { SETTINGS_GROUPS } from '../groups';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';
import { t } from '../../../i18n';

function draw() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the table of contents of the settings tab', () => {
  it('links every group, in the order of the page, by an address that is there', () => {
    draw();
    const groups = [...document.querySelectorAll<HTMLElement>('fieldset.settings-group')];
    expect(groups).toHaveLength(9);
    expect(groups.map((group) => group.id)).toEqual(SETTINGS_GROUPS.map((group) => group.id));

    const nav = screen.getByRole('navigation', { name: t('settings.toc') });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(9);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(groups.map((group) => `#${group.id}`));
  });

  it('captions each link as its group is captioned, the patchpack without its switch', () => {
    draw();
    const nav = screen.getByRole('navigation', { name: t('settings.toc') });
    const groups = [...document.querySelectorAll<HTMLElement>('fieldset.settings-group')];
    within(nav)
      .getAllByRole('link')
      .forEach((link, i) => {
        const legend = groups[i].querySelector('legend')!;
        // the legend of the patchpack group also holds its switch and that switch's caption
        const caption = legend.querySelector('.mantine-Group-root')?.firstChild?.textContent ?? legend.textContent;
        expect(link.textContent).toBe(caption);
      });
    expect(within(nav).getByRole('link', { name: t('settings.jgrpp') })).toBeTruthy();
  });

  it('jumps to the group the address names once the tab has arrived', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    window.history.replaceState(null, '', '/settings#settings-vehicles');
    draw();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('settings-vehicles'));
  });
});
