/**
 * The language switch in the footer. It is the quick way to the other language — the
 * settings tab keeps its own — so what matters here is that one click turns the whole tree
 * over and that the label then names the language it came from.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { TABS } from '../tabs';
import { t } from '../i18n';
import { LOCALE_KEY, useLocaleStore } from '../state/localeStore';

beforeEach(() => useLocaleStore.getState().setLocale('en'));
afterEach(() => {
  cleanup();
  // undone here rather than at the end of the case that sets them: a failing assertion
  // would otherwise leave the next case in this file with a Russian-speaking navigator
  Reflect.deleteProperty(navigator, 'languages');
  localStorage.clear();
  vi.resetModules();
});

/** The app under the providers it runs with, on `path` when one is given. */
async function renderApp(path = '/', Component: typeof App = App) {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Component />
      </MemoryRouter>
    </MantineProvider>,
  );
  await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeTruthy());
}

describe('the footer language switch', () => {
  it('turns the interface over and then names the language it left', async () => {
    await renderApp();

    // the label is the self-name of the other language, never translated
    await userEvent.click(screen.getByRole('button', { name: 'Русский' }));

    expect(useLocaleStore.getState().locale).toBe('ru');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(t(TABS[0].label, {}, 'ru'));
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
  });

  it('sets the same language the settings tab shows', async () => {
    await renderApp('/settings');

    await userEvent.click(screen.getByRole('button', { name: 'Русский' }));

    // the settings tab reads the same store, so its field names the new language
    expect(screen.getByDisplayValue('Русский')).toBeTruthy();
  });

  it('shows the settings tab the language it was set from there', async () => {
    await renderApp('/settings');

    // the other direction: set from the settings field, read in the footer
    await userEvent.click(screen.getByDisplayValue('English'));
    // the library marks its dropdown items with an attribute, not with a role
    const option = [...document.querySelectorAll('[data-combobox-option]')].find(
      (element) => element.textContent === 'Русский',
    )!;
    await userEvent.click(option);

    expect(useLocaleStore.getState().locale).toBe('ru');
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
  });
});

describe('a first visit from a Russian browser', () => {
  it('opens the interface in Russian, not only the store', async () => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { value: ['ru-RU'], configurable: true });
    // a copy of the module graph whose store picks its language on this navigator
    vi.resetModules();
    const { default: FreshApp } = await import('../App');

    await renderApp('/', FreshApp);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      t(TABS[0].label, {}, 'ru'),
    );
    // the shell around it too, not only the tab that happened to be open
    expect(document.querySelector('.app-footer')!.textContent).toContain(
      t('footer.version', {}, 'ru'),
    );
    // and the data too, not only the strings the interface owns: the cargo in the picker is
    // named the way the Russian game names it
    expect(document.body.textContent).toContain('Уголь');
    // and nothing was written: the next start detects afresh
    expect(localStorage.getItem(LOCALE_KEY)).toBeNull();
  });
});
