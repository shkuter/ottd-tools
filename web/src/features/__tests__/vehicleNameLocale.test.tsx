/**
 * Имя машины следует языку интерфейса — и следует ему **сразу**. Список, отфильтрованный по
 * имени, живёт в мемо; если язык в его зависимости не попал, после переключения останется
 * выдача, набранная по прежним именам, а поле поиска будет говорить другое.
 *
 * Ровно этим кончается забывчивость про локаль в мемоизированном месте — случай, записанный
 * в правила проекта, и здесь он ловится на живой странице.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../consist/ConsistPage';
import OptimizerPage from '../optimizer/OptimizerPage';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useLocaleStore } from '../../state/localeStore';
import { useSettingsStore } from '../../state/settingsStore';

afterEach(() => {
  cleanup();
  useLocaleStore.getState().setLocale('en');
});

beforeEach(() => {
  useSettingsStore.getState().reset();
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' },
    calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1950 },
  });
  useLocaleStore.getState().setLocale('ru');
});

const draw = () =>
  render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );

/** Имена машин в первой колонке каталога. */
const listed = () =>
  [...document.querySelectorAll('tbody tr td:first-child')].map((c) => c.textContent?.trim() ?? '');

describe('выдача поиска и язык', () => {
  it('пересобирает отбор по имени движка при смене языка', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider forceColorScheme="dark">
        <MemoryRouter>
          <OptimizerPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText(/Локомотив/i), 'Паровоз');
    await waitFor(() => expect(screen.queryAllByTestId('opt-engine').length).toBeGreaterThan(0));

    // на английском тот же запрос не находит ничего — выдача обязана пересчитаться
    useLocaleStore.getState().setLocale('en');
    await waitFor(() => expect(screen.queryAllByTestId('opt-engine')).toHaveLength(0));
  });
});

describe('каталог и язык', () => {
  it('показывает имена той локали, что выбрана', async () => {
    draw();
    await waitFor(() => expect(listed().length).toBeGreaterThan(0));
    expect(listed()).toContain('Паровоз Kirby Paul Tank');
  });

  it('пересортировывает список при смене языка', async () => {
    const user = userEvent.setup();
    draw();
    await waitFor(() => expect(listed().length).toBeGreaterThan(0));
    // сортируем по имени: порядок обязан следовать тем именам, что на экране
    await user.click(screen.getByText('Название', { selector: 'th' }));
    await waitFor(() => expect(listed().length).toBeGreaterThan(0));
    const ruOrder = listed();
    expect(ruOrder[0]).toMatch(/[А-Яа-я]/);

    useLocaleStore.getState().setLocale('en');
    await waitFor(() => expect(listed()[0]).not.toMatch(/[А-Яа-я]/));
    const enOrder = listed();
    // не просто перевели подписи: порядок пересчитан по английским именам
    expect(enOrder).toEqual([...enOrder].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('пересобирает отбор по имени при смене языка', async () => {
    const user = userEvent.setup();
    draw();
    await waitFor(() => expect(listed().length).toBeGreaterThan(0));

    await user.type(screen.getByPlaceholderText(/Поиск/i), 'Паровоз');
    await waitFor(() => expect(listed().length).toBeGreaterThan(0));
    expect(listed().every((name) => name.includes('Паровоз'))).toBe(true);

    // тот же запрос на английском не находит ничего: имена стали другими, и список обязан
    // пересчитаться, а не остаться набранным по русским именам
    useLocaleStore.getState().setLocale('en');
    await waitFor(() => expect(listed()).toHaveLength(0));
  });
});
