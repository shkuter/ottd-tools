/**
 * Блок «Как считается»: свёрнут по умолчанию, раскрывается с клавиатуры, в свёрнутом виде не
 * пускает в себя фокус и помнит открытость каждого блока отдельно — в своём ключе, который
 * «Сбросить всё» не трогает.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HowComputed } from '../HowComputed';
import { UI_KEY, useUiStore, type HowComputedId } from '../../state/uiStore';
import { resetPersistedState } from '../../state';
import { useLocaleStore } from '../../state/localeStore';
import { t } from '../../i18n';

function draw(ids: readonly HowComputedId[] = ['route']) {
  return render(
    <MantineProvider>
      {ids.map((id) => (
        <HowComputed key={id} id={id}>
          <p>{`text of ${id}`}</p>
          <a href="#inside">{`link of ${id}`}</a>
        </HowComputed>
      ))}
      <button type="button">after</button>
    </MantineProvider>,
  );
}

const toggle = () => screen.getAllByRole('button', { name: t('howComputed.title') })[0];

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  localStorage.removeItem(UI_KEY);
  useUiStore.setState({ howComputedOpen: {} });
});

afterEach(cleanup);

describe('«Как считается»', () => {
  it('свёрнут по умолчанию: текст в DOM, но не виден, а обёртка скрыта от скринридера', () => {
    draw();
    const text = screen.getByText('text of route');
    expect(text).not.toBeVisible();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    const region = document.getElementById(toggle().getAttribute('aria-controls')!);
    expect(region).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([['Enter', '{Enter}'], ['пробел', ' ']])('раскрывается клавишей %s', async (_name, key) => {
    draw();
    const user = userEvent.setup();
    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.keyboard(key);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    // Collapse leaves its folded state on the next frame, so the text shows up a moment later
    await waitFor(() => expect(screen.getByText('text of route')).toBeVisible());
  });

  it('в свёрнутом виде Tab проходит мимо его содержимого', async () => {
    draw();
    const user = userEvent.setup();
    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.tab();
    // следующая остановка — кнопка после блока, а не ссылка внутри него
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    expect(screen.getByText('link of route')).not.toHaveFocus();
  });

  it('пишет открытость в свой ключ с версией 1', async () => {
    draw();
    await userEvent.click(toggle());
    const stored = JSON.parse(localStorage.getItem(UI_KEY)!);
    expect(stored.version).toBe(1);
    expect(stored.state.howComputedOpen).toEqual({ route: true });
  });

  it('помнит каждый блок отдельно и после повторной гидратации', async () => {
    draw(['network.corridor', 'network.signals']);
    await userEvent.click(toggle());
    const saved = localStorage.getItem(UI_KEY)!;
    cleanup();

    // память интерфейса потеряна, хранилище — нет: как после перезагрузки страницы
    useUiStore.setState({ howComputedOpen: {} });
    localStorage.setItem(UI_KEY, saved);
    await useUiStore.persist.rehydrate();

    draw(['network.corridor', 'network.signals']);
    expect(screen.getByText('text of network.corridor')).toBeVisible();
    expect(screen.getByText('text of network.signals')).not.toBeVisible();
  });

  it('«Сбросить всё» открытость не стирает', async () => {
    draw();
    await userEvent.click(toggle());
    await resetPersistedState();
    expect(localStorage.getItem(UI_KEY)).not.toBeNull();
    expect(useUiStore.getState().howComputedOpen).toEqual({ route: true });
  });
});
