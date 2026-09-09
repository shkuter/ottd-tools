import { describe, expect, it } from 'vitest';
import { economyById, industryById } from '../../../dataset';
import type { Snapshot } from '../../../savegame/snapshot';
import type { Economy, Industry } from '../../../types';
import { chainCompleteness, industriesOnMap } from '../completeness';

const steeltown = economyById.get('STEELTOWN')!;

const onSteeltownMap = (onMap: string[], unknownCount = 0) =>
  chainCompleteness({ economy: steeltown, onMap, unknownCount, locale: 'en' });

const shareOf = (result: ReturnType<typeof chainCompleteness>, id: string) =>
  result.industries.find((row) => row.industry.id === id)?.reachableShare;

describe('reachable share', () => {
  it('is 1 when every input can be had here', () => {
    // a coke oven takes COAL alone, at the ceiling ratio of 8
    const result = onSteeltownMap(['coal_mine', 'coke_oven']);
    expect(result.gaps).toEqual([]);
  });

  it('is 0 when nothing on the map makes the input', () => {
    const result = onSteeltownMap(['coke_oven']);
    expect(shareOf(result, 'coke_oven')).toBe(0);
    expect(result.gaps.flatMap((gap) => gap.blocked).map((row) => row.industry.id)).toContain(
      'coke_oven',
    );
  });

  it('counts a supply cargo like any other input', () => {
    // plate_mill is STSL 6 + WELD 2; the cryo plant makes WELD and needs nothing itself, so
    // the mill reaches 2/8 here. Leaving supply cargoes out of the sum would call it a gap.
    const result = onSteeltownMap(['plate_mill', 'cryo_plant']);
    expect(shareOf(result, 'plate_mill')).toBe(2 / 8);
    // works, and is not called a gap — but is not at full output either
    expect(result.gaps.flatMap((gap) => gap.blocked).map((row) => row.industry.id)).not.toContain(
      'plate_mill',
    );
  });

  it('is 1 for an industry whose output does not follow from deliveries', () => {
    expect(shareOf(onSteeltownMap(['coal_mine']), 'coal_mine')).toBe(1);
  });

  it('adds up the inputs one producer covers', () => {
    // the port makes both POWR and COAT, two of the appliance factory's five ratio-3 inputs
    expect(shareOf(onSteeltownMap(['appliance_factory', 'port']), 'appliance_factory')).toBe(6 / 8);
  });

  it('reaches the ceiling only with the supply input, and 6/8 without it', () => {
    // plate_mill is STSL 6 + WELD 2. Steel arrives through quarry → lime kiln → electric arc
    // furnace, none of which makes WELD; the cryo plant is what adds it.
    const steel = ['plate_mill', 'electric_arc_furnace', 'lime_kiln', 'quarry'];
    expect(shareOf(onSteeltownMap(steel), 'plate_mill')).toBe(6 / 8);
    expect(shareOf(onSteeltownMap([...steel, 'cryo_plant']), 'plate_mill')).toBe(1);
  });

  it('reaches the ceiling on three inputs of five, as the set states that rule', () => {
    // "any three of five" is five inputs of ratio 3 against a ceiling of 8: the appliance
    // factory takes STSH, POWR, PUMP, COAT and SEAL. The port covers POWR and COAT; the
    // elastomer plant, fed SULP by a working coke oven, covers SEAL.
    const withSeal = ['appliance_factory', 'coal_mine', 'coke_oven', 'elastomer_products_plant'];
    expect(shareOf(onSteeltownMap(withSeal), 'appliance_factory')).toBe(3 / 8);
    expect(shareOf(onSteeltownMap([...withSeal, 'port']), 'appliance_factory')).toBe(1);
  });

  it('ignores industries this economy does not have', () => {
    expect(onSteeltownMap(['coal_mine', 'not_an_industry']).deadEnds).toHaveLength(1);
  });
});

describe('workability', () => {
  it('carries a gap up the chain', () => {
    // the coke oven stands but cannot run, so the blast furnace it feeds cannot either
    const result = onSteeltownMap(['coke_oven', 'blast_furnace']);
    const blocked = result.gaps.flatMap((gap) => gap.blocked).map((row) => row.industry.id);
    expect(blocked).toContain('coke_oven');
    expect(blocked).toContain('blast_furnace');
  });

  it('names what has to be built, not the dead source standing next to it', () => {
    const result = onSteeltownMap(['coke_oven', 'blast_furnace']);
    expect(result.gaps.map((gap) => gap.industry?.id)).toContain('coal_mine');
  });

  it('leaves a pair feeding only each other unworkable, and terminates', () => {
    // Steeltown has no such cycle, so the set states one: two industries, each the other's
    // only source. The least fixed point never admits them, without a cycle branch.
    const loop: Industry[] = [
      industry('alpha', [{ label: 'BETA', ratio: 8 }], [{ label: 'ALFA', value: 8 }]),
      industry('beta', [{ label: 'ALFA', ratio: 8 }], [{ label: 'BETA', value: 8 }]),
    ];
    const economy: Economy = {
      ...steeltown,
      id: 'LOOP',
      industry_ids: ['alpha', 'beta'],
      graph: { ...steeltown.graph, supply_labels: [] },
    };
    const result = chainCompleteness({
      economy,
      onMap: ['alpha', 'beta'],
      locale: 'en',
      catalogue: new Map(loop.map((found) => [found.id, found])),
    });
    expect(result.gaps).toHaveLength(1);
    // neither can be built out of the other, so the group names no fix
    expect(result.gaps[0].industry).toBeNull();
    expect(result.gaps[0].blocked.map((row) => row.industry.id).sort()).toEqual(['alpha', 'beta']);
  });
});

describe('dead ends', () => {
  it('names the cargo, not the industry making it', () => {
    const result = onSteeltownMap(['coal_mine']);
    expect(result.deadEnds.map((end) => end.cargoLabel)).toEqual(['COAL']);
    expect(result.deadEnds[0].producers.map((row) => row.industry.id)).toEqual(['coal_mine']);
  });

  it('leaves out the output that does have a buyer here', () => {
    // the coke oven makes COKE, CTAR and SULP; only SULP is taken on this map
    const result = onSteeltownMap(['coal_mine', 'coke_oven', 'elastomer_products_plant']);
    // the elastomer plant runs on that SULP, so its own SEAL is stranded in turn
    expect(result.deadEnds.map((end) => end.cargoLabel).sort()).toEqual(
      ['COKE', 'CTAR', 'SEAL'].sort(),
    );
  });

  it('strands nothing from an industry that cannot run', () => {
    expect(onSteeltownMap(['coke_oven']).deadEnds).toEqual([]);
  });

  it('orders the cargoes by the name the reader sees, not by the label', () => {
    // GRVL is "Aggregates" in English and «Песчано-гравийная смесь» in Russian, which puts it
    // first one way and third the other — the label order would be the same in both
    const map = ['coal_mine', 'quarry'];
    const labels = (locale: 'en' | 'ru') =>
      chainCompleteness({ economy: steeltown, onMap: map, locale }).deadEnds.map(
        (end) => end.cargoLabel,
      );
    expect(labels('en')).toEqual(['GRVL', 'COAL', 'LIME', 'SAND']);
    expect(labels('ru')).toEqual(['LIME', 'SAND', 'GRVL', 'COAL']);
  });
});

describe('rows and order', () => {
  it('states one row per type, with the instances behind it', () => {
    const result = onSteeltownMap(['coke_oven', 'coke_oven', 'coke_oven']);
    const row = result.gaps[0].blocked[0];
    expect(row.count).toBe(3);
  });

  it('counts the instances one build would start, not the types', () => {
    const result = onSteeltownMap(['coke_oven', 'coke_oven', 'coke_oven']);
    expect(result.gaps[0].industry?.id).toBe('coal_mine');
    expect(result.gaps[0].starts).toBe(3);
  });

  it('lists an industry under every link that would start it', () => {
    // the blast furnace wants coke, iron and lime: four different builds each lift it off
    // zero, and the groups say so rather than picking one owner
    const result = onSteeltownMap(['coke_oven', 'blast_furnace']);
    const holding = result.gaps.filter((gap) =>
      gap.blocked.some((row) => row.industry.id === 'blast_furnace'),
    );
    expect(holding.map((gap) => gap.industry?.id).sort()).toEqual([
      'coal_mine',
      'iron_ore_mine',
      'limestone_mine',
      'quarry',
    ]);
  });

  it('breaks a tie between links by the name the reader sees', () => {
    // wharf and scrap_yard each start the same two industries; English and Russian disagree
    // on which name comes first
    const map = ['coke_oven', 'plate_mill', 'electric_arc_furnace', 'lime_kiln'];
    const tied = (locale: 'en' | 'ru') =>
      chainCompleteness({ economy: steeltown, onMap: map, locale })
        .gaps.filter((gap) => gap.starts === 2)
        .map((gap) => gap.industry?.id);
    expect(tied('en')).toEqual(['cryo_plant', 'scrap_yard', 'wharf']);
    expect(tied('ru')).toEqual(['cryo_plant', 'wharf', 'scrap_yard']);
  });

  it('names no link that would not start anything on its own', () => {
    // a coke oven would be the blast furnace's source of COKE, but with no coal mine here it
    // would not run either, so building it changes nothing. A quarry would: LIME is another
    // input of the furnace, and a quarry needs nothing to run.
    const result = onSteeltownMap(['blast_furnace']);
    expect(result.gaps.map((gap) => gap.industry?.id)).not.toContain('coke_oven');
    expect(result.gaps.map((gap) => gap.industry?.id)).toContain('quarry');
  });

  it('puts the group nothing can fix last', () => {
    // one gap a single build revives, and a pair that feeds only itself, which none does
    const catalogue = new Map<string, Industry>([
      ['alpha', industry('alpha', [{ label: 'BETA', ratio: 8 }], [{ label: 'ALFA', value: 8 }])],
      ['beta', industry('beta', [{ label: 'ALFA', ratio: 8 }], [{ label: 'BETA', value: 8 }])],
      ['plant', industry('plant', [{ label: 'GAMA', ratio: 8 }], [])],
      ['src_gama', source('src_gama', 'GAMA')],
    ]);
    const economy: Economy = {
      ...steeltown,
      id: 'LOOP',
      industry_ids: [...catalogue.keys()],
      graph: { ...steeltown.graph, supply_labels: [] },
    };
    const result = chainCompleteness({
      economy,
      onMap: ['alpha', 'beta', 'plant'],
      locale: 'en',
      catalogue,
    });
    expect(result.gaps.map((gap) => gap.industry?.id)).toEqual(['src_gama', undefined]);
    expect(result.gaps.at(-1)?.blocked.map((row) => row.industry.id).sort()).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('puts the link that fixes the most first, counting instances not types', () => {
    // one coke oven waits on a coal mine; four plate mills wait on a cryo plant. Counted by
    // types the two groups would tie — the four mills are what makes the plant the bigger fix.
    const result = onSteeltownMap([
      'coke_oven',
      'plate_mill',
      'plate_mill',
      'plate_mill',
      'plate_mill',
    ]);
    expect(result.gaps[0].industry?.id).toBe('cryo_plant');
    expect(result.gaps[0].starts).toBe(4);
    expect(result.gaps[0].blocked).toHaveLength(1);
    const order = result.gaps.map((gap) => gap.starts);
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });

  it('orders the industries of a group by the name the reader sees', () => {
    // Electric Arc Furnace, Lime Kiln, Plate Mill in English; «Известковая печь»,
    // «Листопрокатный стан», «Электродуговая печь» in Russian — the label order would be the
    // same in both, the name order is not
    const map = ['coke_oven', 'plate_mill', 'electric_arc_furnace', 'lime_kiln'];
    const blockedIn = (locale: 'en' | 'ru') =>
      chainCompleteness({ economy: steeltown, onMap: map, locale })
        .gaps[0].blocked.map((row) => row.industry.id);
    expect(blockedIn('en')).toEqual(['electric_arc_furnace', 'lime_kiln', 'plate_mill']);
    expect(blockedIn('ru')).toEqual(['lime_kiln', 'plate_mill', 'electric_arc_furnace']);
  });
});

describe('supply cargoes', () => {
  it('reports the ones no industry on the map makes, ordered as the reader sees them', () => {
    // Engineering Supplies, Farm Supplies, Seals…, Welding… in English; Инженерные,
    // Прокладки, Расходные сварочные, Сельхозтовары in Russian
    const map = ['coal_mine'];
    expect(chainCompleteness({ economy: steeltown, onMap: map, locale: 'en' }).missingSupplies)
      .toEqual(['ENSP', 'FMSP', 'SEAL', 'WELD']);
    expect(chainCompleteness({ economy: steeltown, onMap: map, locale: 'ru' }).missingSupplies)
      .toEqual(['ENSP', 'SEAL', 'WELD', 'FMSP']);
    // and no industry is called a gap over a missing supply
    expect(onSteeltownMap(map).gaps).toEqual([]);
  });

  it('drops the one a producer on the map does make', () => {
    expect(onSteeltownMap(['coal_mine', 'cryo_plant']).missingSupplies).not.toContain('WELD');
  });

  it('says nothing about a supply cargo this economy does not have', () => {
    // the set states one list of supply labels for every economy: Temperate never handles
    // WELD or SEAL, so they are not sources the player is missing
    const temperate = economyById.get('BASIC_TEMPERATE')!;
    const result = chainCompleteness({ economy: temperate, onMap: ['coal_mine'], locale: 'en' });
    expect(result.missingSupplies).not.toContain('WELD');
    expect(result.missingSupplies).not.toContain('SEAL');
  });

  it('keeps the one whose only producer here cannot run', () => {
    // the wire rod mill also makes WELD, but it needs STBL and SOAP, which this map has not
    expect(onSteeltownMap(['coal_mine', 'wire_rod_mill']).missingSupplies).toContain('WELD');
  });
});

describe('industriesOnMap', () => {
  const snapshot = (industries: Snapshot['industries'], rest: Partial<Snapshot> = {}): Snapshot =>
    ({
      soldIds: null,
      companies: [],
      towns: [],
      stations: [],
      routes: [],
      trains: [],
      groups: [],
      industries,
      ...rest,
    }) as Snapshot;

  const plots = [
    { id: 1, catalogueId: 'coal_mine', townId: null, plot: null, produced: [] },
    { id: 2, catalogueId: null, townId: null, plot: null, produced: [] },
  ] as Snapshot['industries'];

  it('counts the industries the catalogue cannot name', () => {
    expect(industriesOnMap(snapshot(plots))).toEqual({ onMap: ['coal_mine'], unknownCount: 1 });
  });

  it('reads nothing the player built', () => {
    const built = snapshot(plots, {
      routes: [{ id: 7, trainIds: [1], stops: [] }] as unknown as Snapshot['routes'],
      trains: [{ id: 1, cargo: [] }] as unknown as Snapshot['trains'],
    });
    expect(industriesOnMap(built)).toEqual(industriesOnMap(snapshot(plots)));
    // and the answer itself, not only what is read out of the save
    const answer = (game: Snapshot) => {
      const { onMap, unknownCount } = industriesOnMap(game);
      return chainCompleteness({ economy: steeltown, onMap, unknownCount, locale: 'en' });
    };
    expect(answer(built)).toEqual(answer(snapshot(plots)));
  });
});

/** A stand-in producer that needs nothing, for shapes the shipped set does not have. */
function source(id: string, label: string): Industry {
  const shape = industryById.get('cryo_plant')!;
  return {
    ...shape,
    id,
    name: id,
    economies: { LOOP: { ...shape.economies.STEELTOWN, accepts: [], produces: [{ label, value: 8 }] } },
  };
}

/** A stand-in industry, for a shape the shipped set does not have. */
function industry(
  id: string,
  accepts: { label: string; ratio: number }[],
  produces: { label: string; value: number }[],
): Industry {
  const shape = industryById.get('coke_oven')!;
  return {
    ...shape,
    id,
    name: id,
    economies: { LOOP: { ...shape.economies.STEELTOWN, accepts, produces } },
  };
}
