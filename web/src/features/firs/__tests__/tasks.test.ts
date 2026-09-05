import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import { chainTasks, deliveryFor, perWindow } from '../tasks';
import { economyById, industriesMeta, industryById } from '../../../dataset';
import { conversion, requiredDelivery, supplyRule as supplyRuleOf } from '../../../engine/supply';

const steeltown = economyById.get('STEELTOWN')!;
const game = DEFAULT_GAME_SETTINGS;
const windowTicks = industriesMeta.supply_window_ticks;

const run = (targetId: string, targetOutputPerMonth = 100) =>
  chainTasks({ economy: steeltown, targetId, targetOutputPerMonth, game, windowTicks });

describe('chainTasks', () => {
  it('gives every input of every chain industry its own task', () => {
    const { tasks } = run('blast_furnace');
    const ownTasks = tasks.filter((t) => t.consumer.id === 'blast_furnace');
    expect(ownTasks.map((t) => t.cargoLabel)).toEqual(['IORE', 'COKE', 'LIME']);
    for (const task of ownTasks) {
      expect(task.consumer.id).toBe('blast_furnace');
      expect(task.producers.length).toBeGreaterThan(0);
    }
  });

  it('scales every volume of every chain with the wanted output', () => {
    // every target of the economy, not one chain: a by-product looping back through a pool
    // industry used to pin the figures to that pool's threshold, and only some chains showed it
    let compared = 0;
    for (const id of steeltown.industry_ids) {
      // a pool or unmodelled target is not sized by an output figure at all — the tab hides
      // the field there, and the case below covers those chains
      if (supplyRuleOf(industryById.get(id)!) !== 'conversion') continue;
      const single = run(id, 100).tasks;
      const double = run(id, 200).tasks;
      expect(single.length).toBe(double.length);
      single.forEach((task, i) => {
        const other = double[i]!;
        if (task.volume.kind !== 'delivery' || other.volume.kind !== 'delivery') return;
        expect(other.volume.perWindow, `${id}: ${task.cargoLabel} to ${task.consumer.id}`)
          .toBeCloseTo(task.volume.perWindow * 2, 6);
        compared += 1;
      });
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('sizes a pool target by its thresholds instead of the wanted output', () => {
    // hauling 640 units into a port is what its top level costs, whatever it puts out
    const volumes = (output: number) =>
      run('port', output)
        .tasks.filter((t) => t.volume.kind === 'delivery')
        .map((t) => (t.volume as { perWindow: number }).perWindow);
    expect(volumes(100000)).toEqual(volumes(100));
    expect(volumes(100).length).toBeGreaterThan(0);
  });

  it('splits a total between inputs by their ratios', () => {
    const { tasks } = run('blast_furnace');
    // IORE 3, COKE 3, LIME 2 — the ore and coke shares are equal, the lime share smaller
    const volumes = new Map(
      tasks
        .filter((t) => t.consumer.id === 'blast_furnace' && t.volume.kind === 'delivery')
        .map((t) => [t.cargoLabel, (t.volume as { perWindow: number }).perWindow]),
    );
    expect(volumes.get('IORE')).toBeCloseTo(volumes.get('COKE')!, 9);
    expect(volumes.get('LIME')! * 3).toBeCloseTo(volumes.get('IORE')! * 2, 9);
  });

  it('answers a pool industry with its own thresholds', () => {
    // a coal mine is a leaf of the coke oven's chain, and its own supplies are still a task
    const mine = run('coke_oven').tasks.find((t) => t.consumer.id === 'coal_mine')!;
    expect(mine.cargoLabel).toBe('ENSP');
    expect(mine.volume).toEqual({
      kind: 'pool',
      levels: [
        { threshold: 16, production_percent: 150 },
        { threshold: 80, production_percent: 250 },
      ],
    });
  });

  it('sums the demand of every industry fed by the same producer', () => {
    // an appliance factory's chain has industries fed the same cargo by one producer, and what
    // that producer must be fed covers all of them at once. Taking the largest demand instead
    // of the sum, or settling a share in one pass before the last demand is known, breaks here
    const { tasks } = run('appliance_factory');
    const demands = tasks
      .filter((t) => t.cargoLabel === 'SEAL' && t.volume.kind === 'delivery')
      .map((t) => (t.volume as { perWindow: number }).perWindow);
    expect(demands.length, 'more than one industry is fed seals').toBeGreaterThan(1);

    // the only industry of the chain making seals, so all of that demand lands on it
    const maker = industryById.get('elastomer_products_plant')!;
    const data = maker.economies.STEELTOWN!;
    const share = conversion(data.accepts.map((input) => input.ratio ?? 0));
    const outputRatio = data.produces.find((entry) => entry.label === 'SEAL')!.value!;
    const total = demands.reduce((sum, value) => sum + value, 0);

    const own = tasks
      .filter((t) => t.consumer.id === maker.id && t.volume.kind === 'delivery')
      .reduce((sum, t) => sum + (t.volume as { perWindow: number }).perWindow, 0);
    expect(own).toBeCloseTo(requiredDelivery(total, share, outputRatio)!, 6);
    // and that is genuinely more than the largest single demand it covers
    expect(own).toBeGreaterThan(requiredDelivery(Math.max(...demands), share, outputRatio)!)
  });

  it('says the chain gave no scale rather than blaming the rule', () => {
    // where a chain states no scale for a converting industry the answer says exactly that —
    // its rule is one the calculator knows, and claiming otherwise would be a lie about it
    const unscaled = steeltown.industry_ids
      .flatMap((id) => run(id).tasks)
      .filter((task) => task.volume.kind === 'unscaled');
    expect(unscaled.length).toBeGreaterThan(0);
    expect(unscaled.every((task) => task.consumer.type === 'IndustrySecondary')).toBe(true);
  });

  it('states nothing rather than zero for a rule it does not model', () => {
    const tertiary = steeltown.industry_ids
      .map((id) => run(id).tasks)
      .flat()
      .find((t) => t.consumer.type === 'IndustryTertiary');
    expect(tertiary?.volume).toEqual({ kind: 'unknown' });
  });

  it('never blames the rule of an industry whose rule it knows', () => {
    for (const id of steeltown.industry_ids) {
      for (const task of run(id).tasks) {
        if (task.volume.kind !== 'unknown') continue;
        expect(task.consumer.type).not.toBe('IndustrySecondary');
      }
    }
  });

  it('asks a pool industry for its top threshold, not its first', () => {
    // produce_primary.pynml compares the count against level 2 first: that is the level a
    // chain is planned for, and level 1 would understate every task feeding the port
    const port = industryById.get('port')!;
    const { chain, tasks } = run('port');
    const inputs = chain.links.filter((link) => link.consumer.id === 'port');
    // the port states no input ratios, so its threshold is spread evenly over its inputs
    const perInput = port.supply_pool!.level2.threshold / inputs.length;

    // one of those inputs is made by a converting industry of the chain; what that industry
    // has to be fed follows from the share above, so a level-1 threshold would show up here
    const link = inputs.find((l) => l.producers.some((p) => supplyRuleOf(p) === 'conversion'))!;
    const maker = link.producers.find((p) => supplyRuleOf(p) === 'conversion')!;
    const data = maker.economies.STEELTOWN!;
    const share = conversion(data.accepts.map((input) => input.ratio ?? 0));
    const ratio = data.produces.find((entry) => entry.label === link.cargoLabel)!.value!;

    const own = tasks
      .filter((t) => t.consumer.id === maker.id && t.volume.kind === 'delivery')
      .reduce((sum, t) => sum + (t.volume as { perWindow: number }).perWindow, 0);
    expect(own).toBeCloseTo(requiredDelivery(perInput, share, ratio)!, 6);
    expect(port.supply_pool!.level2.threshold).toBeGreaterThan(port.supply_pool!.level1.threshold);
  });

  it('covers the largest of several wanted outputs, not the first or the smallest', () => {
    // one delivery makes every product of an industry at once, so a chain wanting two of them
    // has to feed it for the hungrier one; the other comes along with it
    const oven = industryById.get('coke_oven')!;
    const data = oven.economies.STEELTOWN!;
    const share = conversion(data.accepts.map((input) => input.ratio ?? 0));
    // COKE leaves at ratio 6 and tar at 1, so the same amount of tar needs six times the coal
    const coke = requiredDelivery(100, share, 6)!;
    const tar = requiredDelivery(100, share, 1)!;
    expect(tar).toBeGreaterThan(coke);

    expect(deliveryFor(oven, steeltown, new Map([['COKE', 100]]))).toBeCloseTo(coke, 9);
    expect(deliveryFor(oven, steeltown, new Map([['CTAR', 100]]))).toBeCloseTo(tar, 9);
    // asked for both, it is fed for the tar — taking the first entry, or the smaller, would
    // leave the chain short of it
    expect(
      deliveryFor(oven, steeltown, new Map([['COKE', 100], ['CTAR', 100]])),
    ).toBeCloseTo(tar, 9);
  });

  it('makes no task of an industry that takes no supplies', () => {
    // FIRS marks these as accepting nothing at all, so a haul to one would be refused
    for (const id of steeltown.industry_ids) {
      for (const task of run(id).tasks) {
        expect(supplyRuleOf(task.consumer), `${task.cargoLabel} to ${task.consumer.id}`)
          .not.toBe('no-supplies');
      }
    }
  });

  it('turns a monthly figure into one window', () => {
    // the window is 6912 ticks — 93.4 engine days of a 365-day year
    expect(perWindow(1200, game, windowTicks)).toBeCloseTo((1200 * 12 * (6912 / 74)) / 365, 6);
  });
});
