import { describe, expect, it } from 'vitest';
import { economyById, industriesMeta } from '../../../dataset';
import { DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import type { Snapshot, SnapshotIndustry, SnapshotStation } from '../../../savegame/snapshot';
import { chainTasks } from '../tasks';
import {
  FALLBACK_OUTPUT_PER_MONTH,
  defaultOutputPerMonth,
  orderTasks,
  tasksInGame,
  type GameTask,
} from '../gameChain';

const steeltown = economyById.get('STEELTOWN')!;
const tasks = chainTasks({
  economy: steeltown,
  targetId: 'blast_furnace',
  targetOutputPerMonth: 100,
  game: DEFAULT_GAME_SETTINGS,
  windowTicks: industriesMeta.supply_window_ticks,
}).tasks;

const cokeTask = () => tasks.find((t) => t.consumer.id === 'coke_oven' && t.cargoLabel === 'COAL')!;

function industry(over: Partial<SnapshotIndustry> & { id: number }): SnapshotIndustry {
  return {
    catalogueId: null,
    townId: null,
    plot: null,
    produced: [],
    ...over,
  };
}

function station(over: Partial<SnapshotStation> & { id: number }): SnapshotStation {
  return {
    companyId: 0,
    townId: null,
    customName: '',
    suffixKey: null,
    nameNumber: 0,
    isWaypoint: false,
    goods: [],
    supplierIds: [],
    ...over,
  };
}

function snapshot(over: Partial<Snapshot>): Snapshot {
  return {
    soldIds: null,
    companies: [],
    towns: [],
    stations: [],
    routes: [],
    trains: [],
    groups: [],
    industries: [],
    ...over,
  };
}

/** A game with one coke oven, and a coal route that reaches it or does not. */
function withCokeOven(hauls: boolean, capacity = 30) {
  return snapshot({
    industries: [industry({ id: 1, catalogueId: 'coke_oven', townId: 5, plot: { x: 10, y: 10 } })],
    stations: [station({ id: 7, supplierIds: [1] })],
    routes: hauls
      ? [{ id: 0, companyId: 0, stops: [{ kind: 'station', stationId: 7, fullLoad: false }], trainIds: [3], legTiles: [] }]
      : [],
    trains: hauls
      ? [
          {
            id: 3,
            companyId: 0,
            groupId: null,
            routeId: 0,
            unitNumber: 1,
            name: 'Coal',
            buildYear: 1950,
            profitThisYear: 0,
            profitLastYear: 0,
            stopped: false,
            consist: [],
            cargo: [{ label: 'COAL', slot: 0, capacity, loaded: 0 }],
          },
        ]
      : [],
  });
}

describe('tasksInGame', () => {
  it('marks an input the game already hauls as supplied', () => {
    const marked = tasksInGame(tasks, withCokeOven(true));
    expect(marked.find((t) => t.consumer.id === 'coke_oven')!.state).toBe('supplied');
  });

  it('marks an industry that stands there unfed as idle', () => {
    const marked = tasksInGame(tasks, withCokeOven(false));
    expect(marked.find((t) => t.consumer.id === 'coke_oven')!.state).toBe('idle');
  });

  it('reads capacity, not what is loaded right now', () => {
    const empty = tasksInGame(tasks, withCokeOven(true, 0));
    expect(empty.find((t) => t.consumer.id === 'coke_oven')!.state).toBe('idle');
  });

  it('marks a type the game does not have at all as absent', () => {
    const marked = tasksInGame(tasks, snapshot({}));
    expect(marked.every((t) => t.state === 'absent')).toBe(true);
    expect(marked.every((t) => t.source === null)).toBe(true);
  });

  it('picks the nearest of several sources and counts them', () => {
    const game = snapshot({
      industries: [
        industry({ id: 1, catalogueId: 'coke_oven', townId: 5, plot: { x: 10, y: 10 } }),
        industry({ id: 2, catalogueId: 'coal_mine', townId: 9, plot: { x: 50, y: 10 } }),
        industry({
          id: 3,
          catalogueId: 'coal_mine',
          townId: 9,
          plot: { x: 130, y: 10 },
          produced: [{ label: 'COAL', slot: 0, lastMonthProduction: 144, lastMonthTransported: 0 }],
        }),
      ],
    });
    const source = tasksInGame(tasks, game).find((t) => t.consumer.id === 'coke_oven')!.source!;
    expect(source.industry.id).toBe(2);
    expect(source.tiles).toBe(40);
    expect(source.candidates).toBe(2);
    expect(source.legClass).toBe('other-town');
  });

  it('picks the nearest source even when a farther one shares the town', () => {
    // the row says "nearest of N", so the pick follows tiles alone; which task to build first
    // is what leg class decides, and orderTasks does that
    const game = snapshot({
      industries: [
        industry({ id: 1, catalogueId: 'coke_oven', townId: 5, plot: { x: 10, y: 10 } }),
        industry({ id: 2, catalogueId: 'coal_mine', townId: 9, plot: { x: 35, y: 10 } }),
        industry({ id: 3, catalogueId: 'coal_mine', townId: 5, plot: { x: 50, y: 10 } }),
      ],
    });
    const source = tasksInGame(tasks, game).find((t) => t.consumer.id === 'coke_oven')!.source!;
    expect(source.industry.id).toBe(2);
    expect(source.tiles).toBe(25);
    expect(source.legClass).toBe('other-town');
  });

  it('carries the output of the source it picked', () => {
    const game = snapshot({
      industries: [
        industry({ id: 1, catalogueId: 'coke_oven', townId: 5, plot: { x: 10, y: 10 } }),
        industry({
          id: 2,
          catalogueId: 'coal_mine',
          townId: 5,
          plot: { x: 20, y: 10 },
          produced: [{ label: 'COAL', slot: 0, lastMonthProduction: 144, lastMonthTransported: 96 }],
        }),
      ],
    });
    expect(tasksInGame(tasks, game).find((t) => t.consumer.id === 'coke_oven')!.source!.outputPerMonth)
      .toBe(144);
  });

  it('reads the output of the cargo the task hauls, not of any cargo', () => {
    const game = snapshot({
      industries: [
        industry({ id: 1, catalogueId: 'coke_oven', townId: 5, plot: { x: 10, y: 10 } }),
        industry({
          id: 2,
          catalogueId: 'coal_mine',
          townId: 5,
          plot: { x: 20, y: 10 },
          produced: [
            { label: 'ENSP', slot: 1, lastMonthProduction: 999, lastMonthTransported: 0 },
            { label: 'COAL', slot: 0, lastMonthProduction: 144, lastMonthTransported: 96 },
          ],
        }),
      ],
    });
    const coal = tasksInGame(tasks, game).find((t) => t.consumer.id === 'coke_oven')!;
    expect(coal.source!.outputPerMonth).toBe(144);
  });

  it('tells "none on the map" apart from "no plots to measure by"', () => {
    const withPlots = snapshot({
      industries: [industry({ id: 1, catalogueId: 'coke_oven', plot: { x: 1, y: 1 } })],
    });
    // nothing produces coal in this game at all
    const absent = tasksInGame(tasks, withPlots).find((t) => t.consumer.id === 'coke_oven')!;
    expect(absent.sourcesOnMap).toBe(0);

    const noPlots = snapshot({
      industries: [
        industry({ id: 1, catalogueId: 'coke_oven' }),
        industry({ id: 2, catalogueId: 'coal_mine' }),
      ],
    });
    const unmeasured = tasksInGame(tasks, noPlots).find((t) => t.consumer.id === 'coke_oven')!;
    expect(unmeasured.source).toBeNull();
    expect(unmeasured.sourcesOnMap).toBe(1);
  });

  it('states no leg when the save gave no plots', () => {
    const game = snapshot({
      industries: [
        industry({ id: 1, catalogueId: 'coke_oven', townId: 5 }),
        industry({ id: 2, catalogueId: 'coal_mine', townId: 5 }),
      ],
    });
    const task = tasksInGame(tasks, game).find((t) => t.consumer.id === 'coke_oven')!;
    expect(task.source).toBeNull();
    expect(task.state).toBe('idle');
    expect(task.cargoLabel).toBe(cokeTask().cargoLabel);
  });

  it('claims no state at all without a game', () => {
    const marked = tasksInGame(tasks, null);
    expect(marked).toHaveLength(tasks.length);
    // null, not 'absent': without a game nothing is known about what stands on the map
    expect(marked.every((t) => t.source === null && t.state === null)).toBe(true);
  });
});

describe('orderTasks', () => {
  const task = (over: Partial<GameTask>): GameTask =>
    ({ ...tasks[0]!, state: 'idle', source: null, ...over }) as GameTask;
  const source = (over: Partial<NonNullable<GameTask['source']>>) =>
    ({
      industry: industry({ id: 1, catalogueId: 'coal_mine' }),
      catalogueId: 'coal_mine',
      consumer: industry({ id: 2 }),
      tiles: 10,
      legClass: 'other-town' as const,
      candidates: 1,
      outputPerMonth: null,
      ...over,
    });

  it('puts the shorter leg of a class first', () => {
    const short = task({ source: source({ tiles: 18 }) });
    const long = task({ source: source({ tiles: 96 }) });
    expect(orderTasks([long, short])).toEqual([short, long]);
  });

  it('lets the class decide before the length', () => {
    const inTown = task({ source: source({ tiles: 40, legClass: 'same-town' }) });
    const between = task({ source: source({ tiles: 25, legClass: 'other-town' }) });
    expect(orderTasks([between, inTown])).toEqual([inTown, between]);
  });

  it('sends a task with no known leg below every task that has one', () => {
    const known = task({ source: source({ tiles: 300 }) });
    const unknown = task({ source: null });
    expect(orderTasks([unknown, known])).toEqual([known, unknown]);
  });

  it('sinks what is already supplied below longer legs still to do', () => {
    const done = task({ state: 'supplied', source: source({ tiles: 5, legClass: 'same-town' }) });
    const todo = task({ state: 'idle', source: source({ tiles: 300 }) });
    expect(orderTasks([done, todo])).toEqual([todo, done]);
  });

  it('falls back on the chain order without a game', () => {
    const near = task({ state: null, source: null, depth: 0 });
    const far = task({ state: null, source: null, depth: 3 });
    expect(orderTasks([far, near])).toEqual([near, far]);
  });
});

describe('defaultOutputPerMonth', () => {
  it('takes the scale from the target as the game runs it, in the cargo it is measured in', () => {
    const game = snapshot({
      industries: [
        industry({
          id: 1,
          catalogueId: 'coke_oven',
          produced: [
            { label: 'COKE', slot: 0, lastMonthProduction: 240, lastMonthTransported: 200 },
            { label: 'CTAR', slot: 1, lastMonthProduction: 40, lastMonthTransported: 0 },
          ],
        }),
      ],
    });
    expect(defaultOutputPerMonth('coke_oven', 'COKE', game)).toBe(240);
    // the tar it also makes is not what the chain is sized by, so it is not the default either
    expect(defaultOutputPerMonth('coke_oven', 'CTAR', game)).toBe(40);
  });

  it('falls back on a round number without a game', () => {
    expect(defaultOutputPerMonth('coke_oven', 'COKE', null)).toBe(FALLBACK_OUTPUT_PER_MONTH);
  });

  it('falls back when the game has the type but states no output', () => {
    const game = snapshot({ industries: [industry({ id: 1, catalogueId: 'coke_oven' })] });
    expect(defaultOutputPerMonth('coke_oven', 'COKE', game)).toBe(FALLBACK_OUTPUT_PER_MONTH);
  });

  it('falls back when the target makes no cargo the chain can be sized by', () => {
    expect(defaultOutputPerMonth('coke_oven', null, snapshot({}))).toBe(FALLBACK_OUTPUT_PER_MONTH);
  });
});
