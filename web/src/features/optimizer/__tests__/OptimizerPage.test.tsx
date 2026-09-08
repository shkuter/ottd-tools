/**
 * Четвёртая цель вкладки подбора и пустое состояние, которое она может дать. Отбор
 * достаточных вариантов — единственное место калькулятора, где корректный ввод оставляет
 * таблицу пустой, поэтому вкладка обязана назвать условия, которых никто не выполнил, — и
 * назвать только те, что в этом поиске действительно кого-то отвергли.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import OptimizerPage from '../OptimizerPage';
import { useOptimizerStore, type OptimizerState } from '../../../state/optimizerStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/optimizer']}>
        <OptimizerPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** Радиокнопка цели внутри переключателя Mantine. */
const goalInput = (value: string) =>
  document.querySelector<HTMLInputElement>(`input[value="${value}"]`);

/** Выпуск, который не увозит ни один разрешённый парк: достаточных вариантов нет вовсе. */
const NOTHING_IS_ENOUGH = {
  distanceTiles: 120,
  stationTiles: 5,
  productionPerMonth: 4000,
  maxTrains: 2,
  goal: 'cheapest',
} satisfies Partial<OptimizerState>;

/** Машина из первой строки таблицы (третья ячейка: номер, спрайт, название). */
const topEngine = () =>
  document.querySelector('tbody tr')?.querySelectorAll('td')[2]?.textContent ?? '';

/** Кладёт задачу в стор вкладки; страница читает её при рендере. */
const givenSearch = (over: Partial<OptimizerState>) =>
  useOptimizerStore.setState({
    cargoLabel: 'COAL',
    distanceTiles: 40,
    stationTiles: 6,
    productionPerMonth: 1200,
    maxTrains: 4,
    goal: 'profit',
    destinationId: '',
    excludedIds: [],
    ...over,
  });

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
    calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1950 },
  });
});

afterEach(cleanup);

describe('цель «Мин. расходы» на вкладке', () => {
  it('без заданного выпуска недоступна — вместе с двумя другими такими же целями', () => {
    givenSearch({ productionPerMonth: 0 });
    draw();
    // Все три цели, которые меряют что-то относительно выпуска, гаснут вместе, и подсказка
    // рядом называет все три, а не один вывоз.
    for (const goal of ['transported', 'supply', 'cheapest']) {
      expect(goalInput(goal)).toBeTruthy();
      expect(goalInput(goal)!.disabled).toBe(true);
    }
    expect(goalInput('profit')!.disabled).toBe(false);
    expect(screen.getByText(/needs the industry output/i)).toBeTruthy();
  });

  it('возвращается к ранжированию по прибыли, если выпуск обнулили под ней', async () => {
    givenSearch({ goal: 'cheapest' });
    draw();
    const underCheapest = topEngine();
    act(() => useOptimizerStore.setState({ productionPerMonth: 0 }));
    // Числовые поля доходят до перебора только после того, как осядут, поэтому цель следует
    // за строками, а не забегает вперёд, — отсюда ожидание вместо немедленной проверки.
    await waitFor(() => expect(goalInput('cheapest')!.disabled).toBe(true));
    // В сторе цель остаётся «cheapest»; меняется то, по чему вкладка ранжирует.
    expect(useOptimizerStore.getState().goal).toBe('cheapest');
    expect(topEngine()).not.toBe(underCheapest);
  });

  it('меняет порядок выдачи, когда её выбрали', async () => {
    givenSearch({});
    draw();
    const cheapest = goalInput('cheapest')!;
    expect(cheapest.disabled).toBe(false);
    const byProfit = topEngine();
    await userEvent.click(cheapest);
    expect(useOptimizerStore.getState().goal).toBe('cheapest');
    expect(topEngine()).not.toBe(byProfit);
  });

  it('называет условия, опустошившие таблицу, и только их', () => {
    // Маршрут задан по равнине, поэтому уклон никого не отверг и назван быть не должен; окно
    // поставок — тоже: до него ни один вариант не дошёл.
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1950, hillTiles: 0 },
    });
    givenSearch(NOTHING_IS_ENOUGH);
    draw();
    expect(screen.getByText(/cargo left standing at the station/i)).toBeTruthy();
    expect(screen.queryByText(/stalling on the worst grade/i)).toBeNull();
    expect(screen.queryByText(/supply window/i)).toBeNull();
  });

  it('называет и уклон, когда он на маршруте есть', () => {
    givenSearch(NOTHING_IS_ENOUGH);
    draw();
    // Тот же поиск на холме по умолчанию в два тайла: вязнущие на нём составы тоже отвергнуты,
    // и сообщение об этом говорит.
    expect(screen.getByText(/stalling on the worst grade/i)).toBeTruthy();
    expect(screen.getByText(/cargo left standing at the station/i)).toBeTruthy();
  });

  it('оставляет прежнее сообщение, когда пары нет вовсе', () => {
    // Год до начала ростера: поиск никого не отверг, ему просто нечего было ранжировать, и
    // валить это на условия цели значило бы отправить игрока чинить не то.
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1800 },
    });
    givenSearch({ goal: 'cheapest' });
    draw();
    expect(screen.getByText(/fits the current filters/i)).toBeTruthy();
    expect(screen.queryByText(/cargo left standing at the station/i)).toBeNull();
  });

  it('оставляет прежнее сообщение, когда таблицу опустошил фильтр по имени машины', async () => {
    givenSearch({ goal: 'cheapest' });
    draw();
    const filter = screen.getByLabelText('Engine');
    await userEvent.type(filter, 'zzzz');
    // Сам поиск нашёл достаточно; это фильтр ни с чем не совпал, и условия цели тут ни при чём.
    expect(screen.getByText(/fits the current filters/i)).toBeTruthy();
    expect(screen.queryByText(/cargo left standing at the station/i)).toBeNull();
  });
});
