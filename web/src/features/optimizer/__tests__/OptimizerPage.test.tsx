/**
 * Вкладка подбора целиком: отметки для сравнения и панель над таблицей, а также четвёртая цель
 * и пустое состояние, которое она может дать. Отбор достаточных вариантов — единственное место
 * калькулятора, где корректный ввод оставляет таблицу пустой, поэтому вкладка обязана назвать
 * условия, которых никто не выполнил, — и только те, что действительно кого-то отвергли.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Notifications, notifications } from '@mantine/notifications';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import OptimizerPage from '../OptimizerPage';
import { useOptimizerStore, type OptimizerState } from '../../../state/optimizerStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { TRIP_BEFORE, tripOf } from '../../../state/__tests__/tripFixture';
import { useLocaleStore } from '../../../state/localeStore';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import { useConsistStore } from '../../../state/consistStore';
import { useRouteStore } from '../../../state/routeStore';
import { useUiStore } from '../../../state/uiStore';
import { trains } from '../../../dataset';
import { t } from '../../../i18n';

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

/** Машина из первой строки таблицы — по test-id ячейки, а не по её номеру: колонки двигаются. */
const topEngine = () =>
  document.querySelector('tbody tr [data-testid="opt-engine"]')?.textContent ?? '';

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

/** Команда «Сравнить» над таблицей. */
const compareButton = () =>
  screen.getByRole('button', { name: /^Compare \(/ }) as HTMLButtonElement;

/** Отметки сравнения в строках таблицы. */
const picks = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>('.cell-pick input[type="checkbox"]'));

describe('сравнение машин на вкладке', () => {
  it('отметка не трогает выдачу, а вторая открывает команду «Сравнить»', async () => {
    givenSearch({});
    draw();
    const before = document.querySelectorAll('tbody tr').length;
    const top = topEngine();

    await userEvent.click(picks()[0]!);
    // Отметка ничего не считает: те же строки, тот же порядок.
    expect(document.querySelectorAll('tbody tr')).toHaveLength(before);
    expect(topEngine()).toBe(top);
    expect(compareButton().disabled).toBe(true);
    expect(screen.getByText(/Tick one more engine/)).toBeTruthy();

    await userEvent.click(picks()[1]!);
    expect(compareButton().disabled).toBe(false);
    expect(compareButton().textContent).toContain('(2)');
  });

  it('панель появляется по команде и уравнивает вагон', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    expect(screen.queryByText(/Side by side/)).toBeNull();

    await userEvent.click(compareButton());
    expect(screen.getByText(/Side by side/)).toBeTruthy();
    expect(screen.getByText(/Same conditions for everyone/)).toBeTruthy();
    // Таблица выдачи никуда не делась — панель встала над ней.
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('больше четырёх машин рядом не ставит', async () => {
    givenSearch({});
    draw();
    for (const box of picks().slice(0, 4)) await userEvent.click(box);
    expect(screen.getByText(/Up to 4 engines/)).toBeTruthy();
    expect(picks()[4]!.disabled).toBe(true);
    expect(picks().filter((b) => b.checked)).toHaveLength(4);
  });

  it('смена задачи снимает отметки, смена цели — нет', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    expect(picks().filter((b) => b.checked)).toHaveLength(2);

    // Цель пересобирает строки, но задача та же — выбор остаётся.
    await userEvent.click(goalInput('cheapest')!);
    await waitFor(() => expect(picks().filter((b) => b.checked)).toHaveLength(2));

    // Другой груз — другой ответ, и отмеченных машин в нём может не быть.
    act(() => useOptimizerStore.setState({ cargoLabel: 'STEL' }));
    await waitFor(() => expect(picks().filter((b) => b.checked)).toHaveLength(0));
  });

  it.each([
    ['плечо', () => useOptimizerStore.setState({ distanceTiles: 260 })],
    ['длину станции', () => useOptimizerStore.setState({ stationTiles: 4 })],
    ['выпуск', () => useOptimizerStore.setState({ productionPerMonth: 300 })],
    ['предел поездов', () => useOptimizerStore.setState({ maxTrains: 2 })],
    ['исключённые машины', () => useOptimizerStore.setState({ excludedIds: ['haar'] })],
    ['год', () => useSettingsStore.setState({ calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1960 } })],
    ['тип пути', () => useSettingsStore.setState({ calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'ELRL' } })],
    ['длину холма', () => useSettingsStore.setState({ calc: { ...DEFAULT_CALC_SETTINGS, hillTiles: 6 } })],
    [
      'настройку партии',
      () =>
        useSettingsStore.setState({
          game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true, dayLengthFactor: 8 },
        }),
    ],
  ])('сбрасывает отметки, когда меняют %s', async (_name, change) => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    expect(picks().filter((b) => b.checked)).toHaveLength(1);
    act(change);
    await waitFor(() => expect(picks().filter((b) => b.checked)).toHaveLength(0));
  });

  it('закрывает панель, когда задача сменилась', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    await userEvent.click(compareButton());
    expect(screen.getByText(/Side by side/)).toBeTruthy();

    act(() => useOptimizerStore.setState({ distanceTiles: 260 }));
    await waitFor(() => expect(screen.queryByText(/Side by side/)).toBeNull());
  });

  it('убирает панель, когда сняли вторую отметку', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    await userEvent.click(compareButton());
    expect(screen.getByText(/Side by side/)).toBeTruthy();

    // Сняли отметку — сравнивать не с чем, и панель не должна возвращаться сама, когда вторую
    // машину отметят снова.
    await userEvent.click(picks()[1]!);
    expect(screen.queryByText(/Side by side/)).toBeNull();
    await userEvent.click(picks()[1]!);
    expect(screen.queryByText(/Side by side/)).toBeNull();
  });

  it('после смены задачи панель не открывается сама', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    await userEvent.click(compareButton());
    expect(screen.getByText(/Side by side/)).toBeTruthy();

    act(() => useOptimizerStore.setState({ distanceTiles: 260 }));
    await waitFor(() => expect(picks().filter((b) => b.checked)).toHaveLength(0));
    // Отметки сняты — но и признак «панель открыта» должен быть снят: иначе панель вернётся
    // сама, стоит отметить две строки в новом ответе.
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    expect(screen.queryByText(/Side by side/)).toBeNull();
  });

  it('закрывается по команде, не теряя отметок', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    await userEvent.click(compareButton());
    expect(screen.getByText(/Side by side/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /^Close/ }));
    expect(screen.queryByText(/Side by side/)).toBeNull();
    // Отметки остаются: игрок закрыл панель, а не передумал сравнивать.
    expect(picks().filter((b) => b.checked)).toHaveLength(2);
  });

  it('снимает все отметки одной командой', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    await userEvent.click(screen.getByRole('button', { name: /^Clear/ }));
    expect(picks().filter((b) => b.checked)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Compare \(/ })).toBeNull();
  });

  it('после «Снять отметки» панель не возвращается сама', async () => {
    givenSearch({});
    draw();
    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    await userEvent.click(compareButton());
    await userEvent.click(screen.getByRole('button', { name: /^Clear/ }));

    await userEvent.click(picks()[0]!);
    await userEvent.click(picks()[1]!);
    expect(screen.queryByText(/Side by side/)).toBeNull();
  });

  it('на пределе отметку всё ещё можно снять', async () => {
    givenSearch({});
    draw();
    for (const box of picks().slice(0, 4)) await userEvent.click(box);
    expect(picks().filter((b) => b.checked)).toHaveLength(4);
    // Иначе выбор запирается: пятую не отметить, а четвёртую не снять.
    expect(picks()[0]!.disabled).toBe(false);
    await userEvent.click(picks()[0]!);
    expect(picks().filter((b) => b.checked)).toHaveLength(3);
  });

  it('сбрасывает отметки, когда меняют получателя', async () => {
    // У угля в Steeltown потребитель один, менять нечего: берём груз, который принимают
    // несколько предприятий.
    givenSearch({ cargoLabel: 'STSH', destinationId: 'appliance_factory', productionPerMonth: 600 });
    draw();
    await userEvent.click(picks()[0]!);
    expect(picks().filter((b) => b.checked)).toHaveLength(1);
    act(() => useOptimizerStore.setState({ destinationId: 'metal_works' }));
    await waitFor(() => expect(picks().filter((b) => b.checked)).toHaveLength(0));
  });
});

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
    expect(screen.getByText(/Set Output above/)).toBeTruthy();
  });

  it('называет причину у самих недоступных целей — подсказкой и описанием для скринридера', async () => {
    givenSearch({ productionPerMonth: 0 });
    draw();
    const hint = screen.getByText(/Set Output above/);
    for (const goal of ['transported', 'supply', 'cheapest']) {
      // описание радиокнопки — строка, на которую указывает её aria-describedby
      await waitFor(() => {
        const described = goalInput(goal)!.getAttribute('aria-describedby');
        expect(described && document.getElementById(described)?.textContent).toBe(hint.textContent);
      });
      // под указателем причину показывает title на всём пункте, со штриховкой вокруг надписи
      expect(goalInput(goal)!.nextElementSibling!.getAttribute('title')).toBe(hint.textContent);
    }
    expect(goalInput('profit')!.hasAttribute('aria-describedby')).toBe(false);
  });

  it('не описывает цели причиной, когда выпуск задан', async () => {
    givenSearch({ productionPerMonth: 1200 });
    draw();
    await waitFor(() => expect(goalInput('transported')!.disabled).toBe(false));
    expect(goalInput('transported')!.hasAttribute('aria-describedby')).toBe(false);
    expect(document.querySelector('.mantine-SegmentedControl-control [title]')).toBeNull();
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

describe('кнопка «→» в выдаче', () => {
  const engine = trains.find((train) => train.kind === 'engine')!;

  /** Вкладка вместе с приёмником переноса и уведомлениями, как в оболочке. */
  function drawWithIncome() {
    return render(
      <MantineProvider forceColorScheme="dark">
        <Notifications transitionDuration={0} />
        <MemoryRouter initialEntries={['/optimizer']}>
          <Routes>
            <Route path="/optimizer" element={<OptimizerPage />} />
            <Route path="/income" element={<div>income tab</div>} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
  }

  const arrows = () => screen.getAllByRole('button', { name: t('opt.apply') });
  const restore = () => screen.queryAllByRole('button', { name: t('notify.restoreConsist') });

  beforeEach(() => {
    useRouteStore.setState(TRIP_BEFORE);
  });

  afterEach(() => {
    act(() => notifications.clean());
  });

  it('подписана действием с названием вкладки из меню', () => {
    givenSearch({});
    useConsistStore.setState({ entries: [] });
    draw();
    expect(arrows()[0].getAttribute('title')).toContain(t('nav.income'));
  });

  it('поверх собранного состава даёт вернуть и состав, и рейс, не меняя вкладку', async () => {
    givenSearch({});
    useConsistStore.setState({ entries: [{ train: engine, count: 1 }] });
    drawWithIncome();

    await userEvent.click(arrows()[0]);
    expect(screen.getByText('income tab')).toBeTruthy();
    expect(useConsistStore.getState().entries).not.toEqual([{ train: engine, count: 1 }]);
    expect(useRouteStore.getState().cargoLabel).toBe('COAL');

    const [button] = await waitFor(() => {
      expect(restore()).toHaveLength(1);
      return restore();
    });
    await userEvent.click(button);

    expect(useConsistStore.getState().entries).toEqual([{ train: engine, count: 1 }]);
    expect(tripOf(useRouteStore.getState())).toEqual(TRIP_BEFORE);
    // отмена вкладку не меняет
    expect(screen.getByText('income tab')).toBeTruthy();
  });

  it('поверх пустого конструктора переносит состав без уведомления', async () => {
    givenSearch({});
    useConsistStore.setState({ entries: [] });
    drawWithIncome();

    await userEvent.click(arrows()[0]);

    expect(screen.getByText('income tab')).toBeTruthy();
    expect(useConsistStore.getState().entries.length).toBeGreaterThan(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(restore()).toHaveLength(0);
  });
});

/** Ячейки первой строки выдачи. */
const firstRowCells = () => [...document.querySelectorAll('tbody tr:first-child td')];

/** Заголовок, под которым стоит столбец таблицы с этим номером: шапка складывает спаны. */
function headOfColumn(column: number) {
  let start = 0;
  for (const th of document.querySelectorAll<HTMLTableCellElement>('thead th')) {
    const span = th.colSpan || 1;
    if (column < start + span) return th.textContent ?? '';
    start += span;
  }
  return '';
}

describe('колонка числа цели', () => {
  it.each([
    ['прибыль', {}, () => t('opt.profitYear')],
    ['мин. расходы', { goal: 'cheapest' }, () => t('table.running')],
    ['вывоз', { goal: 'transported' }, () => t('opt.hauled')],
  ] as const)('при цели «%s» стоит сразу после вагонов', (_name, over, heading) => {
    givenSearch(over);
    draw();
    const cells = firstRowCells();
    const figure = cells.findIndex((td) => td.getAttribute('data-testid') === 'opt-goal-figure');
    const engine = cells.findIndex((td) => td.getAttribute('data-testid') === 'opt-engine');
    // за именем локомотива — спрайт и имя вагона, а следом уже число цели
    expect(engine).toBeGreaterThan(0);
    expect(figure).toBe(engine + 3);
    expect(headOfColumn(figure)).toContain(heading());
    // колонка не задвоилась и не пропала: столбцов в шапке столько же, сколько ячеек в строке
    const columns = [...document.querySelectorAll<HTMLTableCellElement>('thead th')].reduce(
      (n, th) => n + (th.colSpan || 1),
      0,
    );
    expect(cells).toHaveLength(columns);
  });

  it('у «Снабжения» колонки после вагонов не переставляет', () => {
    givenSearch({ goal: 'supply' });
    draw();
    expect(goalInput('supply')!.checked).toBe(true);
    const cells = firstRowCells();
    const engine = cells.findIndex((td) => td.getAttribute('data-testid') === 'opt-engine');
    expect(headOfColumn(engine + 3)).toContain(t('opt.cargoTrip'));
  });
});

describe('строка «Ранжировано по»', () => {
  const rankedBy = () => screen.getByTestId('ranked-by').textContent ?? '';

  /** Слова стоят в строке и идут в заданном порядке — порядке сравнения в переборе. */
  function inOrder(text: string, words: readonly string[]) {
    const at = words.map((word) => text.toLowerCase().indexOf(word));
    expect(at.every((i) => i >= 0), `${text} — ${words.join(', ')}`).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  }

  // общий разбор равенства в `better`: прибыль, цена покупки, вагон, размер флота
  // «smaller fleet», not «fleet»: the cheapest goal names the fleet's running cost first
  const TIES = ['profit', 'purchase price', 'wagon', 'smaller fleet'];

  it.each([
    ['profit', {}, []],
    ['cheapest', { goal: 'cheapest' }, ['running cost']],
    ['transported', { goal: 'transported' }, ['hauled']],
    ['supply', { goal: 'supply' }, ['conversion', 'supply window']],
  ] as const)('при цели %s называет её показатель и ведущие ключи порядка', (goal, over, lead) => {
    givenSearch(over);
    draw();
    expect(goalInput(goal)!.checked).toBe(true);
    inOrder(rankedBy(), [...lead, ...TIES]);
    // служебный хвост — число вагонов, локомотив, число локомотивов — строка не называет
    expect(rankedBy()).not.toMatch(/number of|identifier|engine/i);
  });

  it('называет прибыль, когда выбран «Вывоз», а выпуск не задан', () => {
    givenSearch({ goal: 'transported', productionPerMonth: 0 });
    draw();
    expect(rankedBy()).toBe(t('opt.rankedBy.profit'));
    const figure = firstRowCells().findIndex(
      (td) => td.getAttribute('data-testid') === 'opt-goal-figure',
    );
    expect(headOfColumn(figure)).toContain(t('opt.profitYear'));
  });

  it('не меняется от сортировки по колонке', async () => {
    givenSearch({ goal: 'cheapest' });
    draw();
    const before = rankedBy();
    const cost = [...document.querySelectorAll<HTMLElement>('thead .sort-button')].find((b) =>
      b.textContent?.includes(t('table.cost')),
    )!;
    await userEvent.click(cost);
    expect(document.querySelector('thead .sorted')).toBeTruthy();
    expect(rankedBy()).toBe(before);
  });
});

describe('подсказка о выпуске', () => {
  it.each(['en', 'ru'] as const)(
    'в %s называет поле так, как его подписывает форма, и приглашает его задать',
    (locale) => {
      useLocaleStore.setState({ locale });
      givenSearch({ productionPerMonth: 0 });
      draw();
      const hint = document.querySelector('.goal-hint')!.textContent ?? '';
      expect(hint.toLowerCase()).toContain(t('opt.production').toLowerCase());
      // на экране нет поля «производство» — только «Выпуск»
      expect(hint).not.toMatch(/production|производств/i);
    },
  );
});

describe('«Как считается» на вкладке', () => {
  beforeEach(() => {
    useUiStore.setState({ howComputedOpen: {} });
  });

  it('прячет допущения модели под выдачу, а строки состояния оставляет на виду', async () => {
    givenSearch({ productionPerMonth: 0 });
    draw();
    // свёрнутый текст остаётся в DOM и только спрятан, поэтому проверяется видимость
    const assumption = screen.getByText(t('opt.assumption'));
    expect(assumption).not.toBeVisible();
    expect(document.querySelector('.goal-hint')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: t('howComputed.title') }));
    // Collapse leaves its folded state on the next frame, so the text shows up a moment later
    await waitFor(() => expect(assumption).toBeVisible());
  });

  it('расшифровку «?» прячет, а флажки сомнительных машин — нет', async () => {
    // в 1900 году у ростера Iron Horse есть машины, чьё появление под вопросом
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1900 },
    });
    givenSearch({});
    draw();
    const toggles = document.querySelector('.intro-toggles');
    expect(toggles, 'в этой задаче есть сомнительные машины').toBeTruthy();
    expect(toggles).toBeVisible();
    const legend = document.querySelector('.how-computed .intro-warn')!.parentElement!;
    expect(legend).not.toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: t('howComputed.title') }));
    await waitFor(() => expect(legend).toBeVisible());
  });
});
