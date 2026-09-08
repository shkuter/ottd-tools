/**
 * Панель сравнения: как показатели выглядят в ячейках. Числа сюда приходят готовыми, поэтому
 * проверяется формат — и прежде всего то, что снабжение читается так же, как в колонке выдачи.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComparisonPanel } from '../ComparisonPanel';
import type { ComparisonColumn, ComparisonMetric } from '../comparison';
import { cargoByLabel, trains } from '../../../dataset';
import { useLocaleStore } from '../../../state/localeStore';

const engine = trains.find((t) => t.id === 'haar')!;
const other = trains.find((t) => t.id === 'mainstay')!;
const coal = cargoByLabel.get('COAL')!;

const column = (train: typeof engine, over: Partial<ComparisonColumn> = {}): ComparisonColumn => ({
  engine: train,
  engineCount: 1,
  row: null,
  refused: [],
  ...over,
});

/** Колонка с ответом: панель читает из строки только то, что рисует шапка. */
const answered = (train: typeof engine) =>
  column(train, { row: { engine: train, engineCount: 1 } as ComparisonColumn['row'] });

const metric = (
  over: Partial<ComparisonMetric> & Pick<ComparisonMetric, 'id' | 'key' | 'kind'>,
): ComparisonMetric => ({
  values: [1, 2],
  best: [false, false],
  direction: 'up',
  ...over,
});

function draw(columns: ComparisonColumn[], metrics: ComparisonMetric[]) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <ComparisonPanel
        columns={columns}
        metrics={metrics}
        wagonName="Coal Hopper"
        cargo={coal}
        onClose={() => {}}
      />
    </MantineProvider>,
  );
}

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));
afterEach(cleanup);

describe('панель сравнения', () => {
  const pair = () => [answered(engine), answered(other)];

  it('показывает прибавку пула процентами, а отношение окна — долей', () => {
    // Ровно как колонка снабжения в выдаче: у пула `num(value)%`, у конверсии `num(value, 2)`.
    draw(pair(), [metric({ id: 'supply', key: 'opt.supply', kind: 'supplyBonus', values: [250, 130] })]);
    expect(screen.getByText('250%')).toBeTruthy();
    expect(screen.getByText('130%')).toBeTruthy();
    cleanup();

    draw(pair(), [metric({ id: 'supply', key: 'opt.supply', kind: 'supplyRatio', values: [0.83, 1.2] })]);
    expect(screen.getByText('0.83')).toBeTruthy();
    expect(screen.getByText('1.2')).toBeTruthy();
  });

  it('называет валюту и единицу груза в стоимости единицы доставленного', () => {
    draw(pair(), [metric({ id: 'costPerUnit', key: 'compare.costPerUnit', kind: 'moneyPerUnit', values: [5.4, 7.2] })]);
    // В ячейке деньги за единицу груза, поэтому подпись называет обе части — «£/tonnes», а не
    // «tonnes», иначе читалось бы, будто в ячейке тонны.
    expect(screen.getByText(/Running cost per unit delivered/).textContent).toBe(
      'Running cost per unit delivered, £/tonnes',
    );
  });

  it('берёт единицу у самого груза, а не подставляет тонны', () => {
    render(
      <MantineProvider forceColorScheme="dark">
        <ComparisonPanel
          columns={pair()}
          metrics={[metric({ id: 'costPerUnit', key: 'compare.costPerUnit', kind: 'moneyPerUnit', values: [1, 2] })]}
          wagonName="Box Car"
          cargo={cargoByLabel.get('ENSP')!}
          onClose={() => {}}
        />
      </MantineProvider>,
    );
    expect(screen.getByText(/Running cost per unit delivered/).textContent).toContain('crates');
  });

  it('показывает каждый вид числа в своих единицах', () => {
    // Тяга приходит в ньютонах, а подпись обещает килоньютоны: без деления ячейка показала бы
    // «258720 кН». Остальные виды проверяются здесь же — формат ячейки нигде больше не виден.
    draw(pair(), [
      metric({ id: 'tractiveEffort', key: 'consist.stats.maxTe', kind: 'force', values: [258720, 329084] }),
      metric({ id: 'length', key: 'consist.stats.length', kind: 'tiles', values: [5.75, 5.875] }),
      metric({ id: 'roundTrip', key: 'combined.roundTrip', kind: 'days', values: [72.43, 80.1] }),
      metric({ id: 'rating', key: 'opt.rating', kind: 'share', values: [0.68, 0.71] }),
      metric({ id: 'payback', key: 'opt.payback', kind: 'years', values: [0.29, 1.5] }),
    ]);
    expect(screen.getByText('258.7')).toBeTruthy();
    expect(screen.queryByText(/258720/)).toBeNull();
    expect(screen.getByText('5.75')).toBeTruthy();
    expect(screen.getByText('72.4')).toBeTruthy();
    expect(screen.getByText('68%')).toBeTruthy();
    expect(screen.getByText('0.3')).toBeTruthy();
  });

  it('ставит прочерк там, где значения нет', () => {
    draw(pair(), [metric({ id: 'costPerUnit', key: 'compare.costPerUnit', kind: 'moneyPerUnit', values: [null, null] })]);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('отмечает лучшее значение строки', () => {
    draw(pair(), [metric({ id: 'running', key: 'table.running', kind: 'money', values: [10, 20], best: [true, false], direction: 'down' })]);
    const marked = document.querySelectorAll('.compare-best');
    expect(marked).toHaveLength(1);
  });

  it('называет сдвоенную машину так же, как вся остальная выдача', () => {
    // «2× Haar», а не «Haar ×2»: подпись машины во всём калькуляторе собирает `engineLabel`.
    const doubled = column(engine, {
      engineCount: 2,
      row: { engine, engineCount: 2 } as ComparisonColumn['row'],
    });
    draw([doubled, answered(other)], [metric({ id: 'hauled', key: 'opt.hauled', kind: 'cargo' })]);
    expect(screen.getByText(`2× ${engine.name}`)).toBeTruthy();
    expect(screen.queryByText(`${engine.name} ×2`)).toBeNull();
  });

  it('называет машины с их картинками', () => {
    draw(pair(), [metric({ id: 'hauled', key: 'opt.hauled', kind: 'cargo' })]);
    expect(screen.getByText(engine.name)).toBeTruthy();
    expect(screen.getByText(other.name)).toBeTruthy();
    // Картинка каждой машины — своя: одна и та же в обеих колонках была бы бесполезна.
    const sprites = [...document.querySelectorAll<HTMLImageElement>('thead img')];
    expect(sprites).toHaveLength(2);
    expect(sprites[0]!.src).not.toBe(sprites[1]!.src);
  });

  it('не заводит строку «Ответ», когда ответ есть у всех', () => {
    draw(pair(), [metric({ id: 'hauled', key: 'opt.hauled', kind: 'cargo' })]);
    expect(screen.queryByText('Answer')).toBeNull();
  });

  it('объясняет колонку без ответа', () => {
    const columns = [answered(engine), column(other, { refused: ['backlog'] })];
    draw(columns, [metric({ id: 'hauled', key: 'opt.hauled', kind: 'cargo', values: [10, null] })]);
    expect(screen.getByText('Answer')).toBeTruthy();
    expect(screen.getByText(/nothing is enough/)).toBeTruthy();
    expect(screen.getByText(/cargo left standing at the station/)).toBeTruthy();
    cleanup();

    draw([answered(engine), column(other)], [metric({ id: 'hauled', key: 'opt.hauled', kind: 'cargo', values: [10, null] })]);
    expect(screen.getByText(/no consist works here/)).toBeTruthy();
  });
});
