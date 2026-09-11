/**
 * Как выдача говорит о том, что цель не различает её строки. Два способа, и выбор между ними
 * зависит от того, сколько строк равноценно: когда их большинство — одна строка над таблицей,
 * когда меньшинство — пометка у самой строки. Пятьдесят одинаковых пометок в столбик не
 * сообщают ничего.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import OptimizerPage from '../OptimizerPage';
import en from '../../../i18n/en.json';
import { useOptimizerStore } from '../../../state/optimizerStore';
import { DEFAULT_SEARCH_PARAMS } from '../../../state/searchParams';
import { useSettingsStore } from '../../../state/settingsStore';

afterEach(cleanup);

beforeEach(() => {
  useSettingsStore.getState().reset();
  useSettingsStore.setState((state) => ({
    game: { ...state.game, trainSet: 'iron_horse', firs: true },
  }));
  // задача оптимизатора тоже переживает перерисовку — иначе год, плечо или выпуск, введённые
  // одним тестом, достаются следующему, и считается он уже не о том
  useOptimizerStore.setState({
    ...DEFAULT_SEARCH_PARAMS,
    cargoLabel: 'FEAL',
    distanceTiles: 300,
    productionPerMonth: 0,
    goal: 'profit',
    destinationId: '',
    excludedIds: [],
    prefillOrigin: null,
  });
});

const show = () =>
  render(
    <MemoryRouter>
      <MantineProvider>
        <OptimizerPage />
      </MantineProvider>
    </MemoryRouter>,
  );

/** Сообщение узнаётся по своему классу: английская строка начинается с подстановки. */
const note = () => screen.queryByTestId('equivalent-note');

/** Пометки равноценности на строках. */
const marks = () => [...document.querySelectorAll('.equivalent-mark')];

/** Переключатель целей — группа радиокнопок Mantine: подпись рядом, искать по value. */
const goalRadio = (value: string) =>
  waitFor(() => {
    const radio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === value) as HTMLInputElement;
    expect(radio.disabled).toBe(false);
    return radio;
  });

describe('равноценность в выдаче', () => {
  it('при цели «Прибыль» сообщения над таблицей нет', async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));
    expect(note()).toBeNull();
    // и пометок тоже нет: равноценна только сама лучшая строка
    expect(marks()).toHaveLength(0);
  });

  it('при цели «Снабжение» сообщение появляется и называет эту цель', async () => {
    // уголь на коротком плече: выдача длиннее одной страницы списка, иначе знаменатель
    // сообщения не отличить от числа строк на экране
    useOptimizerStore.setState({ cargoLabel: 'COAL', distanceTiles: 40, stationTiles: 6 });
    show();
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));
    // цель требует заданного выпуска и приёмника — задаём производство
    const production = screen.getByLabelText(en['opt.production']);
    await userEvent.clear(production);
    await userEvent.type(production, '900');
    await userEvent.click(await goalRadio('supply'));
    // поля задачи применяются с задержкой, поэтому ждём дольше обычного
    await waitFor(() => expect(note()?.textContent).toContain(en['opt.goalSupply']), {
      timeout: 5000,
    });
    const rowsBefore = screen.getAllByTestId('opt-engine').length;
    // Сообщение — про всю выдачу, а не про показанную её часть. Проверяется тем, что оно не
    // меняется, когда открываешь следующую часть списка: счёт по видимым строкам вырос бы.
    const before = note()!.textContent;
    const showMore = screen.queryByRole('button', { name: /Show \d+ more/ });
    expect(showMore, 'выдача умещается на одну страницу — проверять нечего').not.toBeNull();
    await userEvent.click(showMore!);
    await waitFor(() =>
      expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(rowsBefore),
    );
    expect(note()!.textContent).toBe(before);
  });

  it('называет действующую цель, а не выбранную', async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));
    const production = screen.getByLabelText(en['opt.production']);
    await userEvent.clear(production);
    await userEvent.type(production, '900');
    await userEvent.click(await goalRadio('transported'));
    // на этой задаче по вывозу равноценны семь строк из тридцати — меньшинство, поэтому
    // говорят пометки, и говорить они обязаны про вывоз
    await waitFor(() => expect(marks().length).toBeGreaterThan(0), { timeout: 5000 });
    expect(marks()[0].getAttribute('title')).toContain(en['opt.goalTransported']);
    // Убираем выпуск: цель «Вывоз» без него недоступна, и расчёт откатывается на прибыль.
    // Видно это по колонке показателя: она уходит из «Вывоза» — колонка вывоза рисуется
    // только при своей цели, — и число помеченных ячеек считается уже по прибыли.
    const hauledHeader = [...document.querySelectorAll('th.sortable')].some((th) =>
      th.textContent?.includes(en['opt.hauled']),
    );
    expect(hauledHeader).toBe(true);
    await userEvent.clear(production);
    await waitFor(
      () => {
        const stillHauled = [...document.querySelectorAll('th.sortable')].some((th) =>
          th.textContent?.includes(en['opt.hauled']),
        );
        expect(stillHauled).toBe(false);
      },
      { timeout: 5000 },
    );
  });

  it('пометки при цели «Прибыль» стоят и говорят про прибыль', async () => {
    // Задача, на которой прибыль двух машин совпадает: уголь, короткое плечо, станция в два
    // тайла, один поезд — ровно случай «равноценных меньшинство» из спеки. Задаётся стором,
    // а не вводом в поля: пять полей подряд — это про ввод, а не про то, что проверяется.
    useOptimizerStore.setState({
      cargoLabel: 'COAL',
      distanceTiles: 10,
      stationTiles: 2,
      maxTrains: 1,
      productionPerMonth: 0,
      goal: 'profit',
    });
    // год живёт в настройках калькулятора: он один на все вкладки
    useSettingsStore.setState((state) => ({ calc: { ...state.calc, priceYear: 1960 } }));
    show();
    await waitFor(() => expect(marks().length).toBeGreaterThan(1), { timeout: 5000 });
    expect(note()).toBeNull();
    for (const m of marks()) {
      expect(m.getAttribute('title')).toContain(en['opt.goalProfit']);
      expect(m.closest('td')?.getAttribute('data-testid')).toBe('opt-goal-figure');
    }
  });

  it('при цели «Вывоз» с большинством равноценных говорит сообщение, а не пометки', async () => {
    // сорок девять строк из пятидесяти вывозят поровну — случай, ради которого сообщение и
    // заведено: пятьдесят одинаковых пометок в столбик не сказали бы ничего
    useOptimizerStore.setState({
      cargoLabel: 'COAL',
      distanceTiles: 40,
      stationTiles: 6,
      maxTrains: 6,
      productionPerMonth: 900,
      goal: 'transported',
    });
    show();
    await waitFor(() => expect(note()).not.toBeNull(), { timeout: 5000 });
    expect(note()!.textContent).toContain(en['opt.goalTransported']);
    expect(marks()).toHaveLength(0);
  });

  it('при цели «Мин. расходы» ничья помечается у числа содержания', async () => {
    useOptimizerStore.setState({
      cargoLabel: 'COAL',
      distanceTiles: 20,
      stationTiles: 3,
      maxTrains: 2,
      productionPerMonth: 400,
      goal: 'cheapest',
    });
    useSettingsStore.setState((state) => ({ calc: { ...state.calc, priceYear: 1960 } }));
    show();
    await waitFor(() => expect(marks().length).toBeGreaterThan(1), { timeout: 5000 });
    expect(note()).toBeNull();
    for (const m of marks()) {
      expect(m.getAttribute('title')).toContain(en['opt.goalCheapest']);
      expect(m.closest('td')?.getAttribute('data-testid')).toBe('opt-goal-figure');
    }
  });

  it('при откате на прибыль сказанное называет прибыль, а не выбранную цель', async () => {
    // выбран «Вывоз», но выпуск не задан — цель недоступна, и считается прибыль; на задаче с
    // ничьёй по прибыли пометки обязаны назвать именно её
    useOptimizerStore.setState({
      cargoLabel: 'COAL',
      distanceTiles: 10,
      stationTiles: 2,
      maxTrains: 1,
      productionPerMonth: 0,
      goal: 'transported',
    });
    useSettingsStore.setState((state) => ({ calc: { ...state.calc, priceYear: 1960 } }));
    show();
    await waitFor(() => expect(marks().length).toBeGreaterThan(1), { timeout: 5000 });
    for (const m of marks()) {
      expect(m.getAttribute('title')).toContain(en['opt.goalProfit']);
      expect(m.getAttribute('title')).not.toContain(en['opt.goalTransported']);
    }
  });

  it('пересортировка выдачи не меняет, какие строки равноценны', async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));
    const production = screen.getByLabelText(en['opt.production']);
    await userEvent.clear(production);
    await userEvent.type(production, '900');
    await userEvent.click(await goalRadio('transported'));
    await waitFor(() => expect(marks().length).toBeGreaterThan(0), { timeout: 5000 });
    // помечена строка или нет — по имени машины, а не по месту в таблице: сортировка меняет
    // и порядок, и то, какие строки попали в видимую часть
    // ключ — имя машины, признак — пометка где угодно в строке: она стоит в ячейке числа
    // цели, а не рядом с именем
    const flags = () =>
      new Map(
        [...document.querySelectorAll('tbody tr')].map((row) => [
          row.querySelector('[data-testid="opt-engine"]')?.textContent?.trim() ?? '',
          row.querySelector('.equivalent-mark') !== null,
        ]),
      );
    const before = flags();
    const header = [...document.querySelectorAll('th.sortable')].find((th) =>
      th.textContent?.includes(en['table.cost']),
    )!;
    await userEvent.click(header);
    const after = flags();
    const shared = [...after.keys()].filter((name) => before.has(name));
    expect(shared.length).toBeGreaterThan(3);
    // без этого сверялись бы одни false: пометок в строках должно быть сколько-то
    expect([...before.values()].filter(Boolean).length).toBeGreaterThan(0);
    for (const name of shared) {
      expect(after.get(name), name).toBe(before.get(name));
    }
  });

  it('пометка стоит у числа действующей цели, а не где придётся', async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));
    const production = screen.getByLabelText(en['opt.production']);
    await userEvent.clear(production);
    await userEvent.type(production, '900');
    await userEvent.click(await goalRadio('transported'));
    await waitFor(() => expect(marks().length).toBeGreaterThan(0), { timeout: 5000 });
    for (const m of marks()) {
      expect(m.closest('td')?.getAttribute('data-testid')).toBe('opt-goal-figure');
    }
    // и колонка эта — та, что отвечает выбранной цели: у вывоза она своя
    expect(document.querySelectorAll('[data-testid="opt-goal-figure"]').length).toBe(
      screen.getAllByTestId('opt-engine').length,
    );
  });

  it('сообщение и пометки исключают друг друга', async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId('opt-engine').length).toBeGreaterThan(0));
    const production = screen.getByLabelText(en['opt.production']);
    await userEvent.clear(production);
    await userEvent.type(production, '900');
    // «Снабжение» всегда говорит сообщением: пометке там не у чего стоять
    await userEvent.click(await goalRadio('supply'));
    await waitFor(() => expect(note()).not.toBeNull(), { timeout: 5000 });
    expect(marks()).toHaveLength(0);
    // «Вывоз» на этой задаче — случай пометок, и тогда сообщения быть не должно
    await userEvent.click(await goalRadio('transported'));
    await waitFor(() => expect(marks().length).toBeGreaterThan(0), { timeout: 5000 });
    expect(note()).toBeNull();
  });
});
