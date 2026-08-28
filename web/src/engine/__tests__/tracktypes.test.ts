import { describe, expect, it } from 'vitest';
import {
  canRunOn,
  isCompatibleWith,
  isPoweredOn,
  poweredOutputOn,
  trackSpeedLimit,
  trackTypeOfConsist,
  vehiclePowerOn,
  vehicleSpeedOn,
} from '../tracktypes';
import {
  activeRailtypes, activeTrainsMeta, cargoByLabel, selectableRailtypes, trains, trainsMeta,
} from '../../dataset';
import { consistPhysics } from '../consist';
import { optimizeConsists } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { balancingSpeed } from '../physics';
import { daysForDistance, mphToInternal } from '../units';
import { vanillaCargos, vanillaRailtypes, vanillaTrains } from '../../vanilla';
import type { Railtype } from '../../types';

const IRON_HORSE_GAME = { ...DEFAULT_GAME_SETTINGS, ironHorse: true };
const ironHorse = trainsMeta.railtypes;
const track = (table: readonly Railtype[], label: string) =>
  table.find((rt) => rt.label === label)!;

const rail = track(ironHorse, 'RAIL');
const elrl = track(ironHorse, 'ELRL');
const naan = track(ironHorse, 'NAAN');
const mtro = track(ironHorse, 'MTRO');
const lgve = track(ironHorse, 'LGVE');

const byId = new Map(trains.map((t) => [t.id, t]));
const electric = byId.get('pinhorse')!;
const electroDiesel = byId.get('shoebox')!;
const highSpeed = byId.get('blaze_cab')!;
const narrowGaugeEngine = byId.get('bean_feast')!;

describe('what runs on a track', () => {
  it('an electric engine is powered only under the wires', () => {
    expect(isPoweredOn(electric, elrl, ironHorse)).toBe(true);
    expect(isPoweredOn(electric, rail, ironHorse)).toBe(false);
  });

  it('a diesel is powered on electrified track too, as the game has it', () => {
    const diesel = trains.find(
      (t) => t.kind === 'engine' && t.power_by_source?.DIESEL && !t.power_by_source?.OHLE,
    )!;
    expect(isPoweredOn(diesel, rail, ironHorse)).toBe(true);
    expect(isPoweredOn(diesel, elrl, ironHorse)).toBe(true);
  });

  it('an electro-diesel is powered on both', () => {
    expect(isPoweredOn(electroDiesel, rail, ironHorse)).toBe(true);
    expect(isPoweredOn(electroDiesel, elrl, ironHorse)).toBe(true);
  });

  it('a narrow gauge engine is powered on its own track', () => {
    // the set states no mask for it at all; unnormalised, this is where the narrow
    // gauge catalogue would silently come up empty
    expect(isPoweredOn(narrowGaugeEngine, naan, ironHorse)).toBe(true);
    expect(isPoweredOn(narrowGaugeEngine, rail, ironHorse)).toBe(false);
  });

  it('metro vehicles are powered on metro track', () => {
    const metro = trains.find((t) => t.base_track_type === 'METRO' && t.kind === 'engine')!;
    expect(isPoweredOn(metro, mtro, ironHorse)).toBe(true);
    expect(isPoweredOn(metro, rail, ironHorse)).toBe(false);
  });

  it('a narrow gauge wagon does not fit standard gauge', () => {
    const wagon = trains.find((t) => t.kind === 'wagon' && t.base_track_type === 'NG')!;
    expect(isCompatibleWith(wagon, naan, ironHorse)).toBe(true);
    expect(isCompatibleWith(wagon, rail, ironHorse)).toBe(false);
  });

  it('an electric engine still travels on plain rail, it just makes no power there', () => {
    // compatible is the weaker relation: the game lets it be towed
    expect(isCompatibleWith(electric, rail, ironHorse)).toBe(true);
    expect(isPoweredOn(electric, rail, ironHorse)).toBe(false);
  });

  it('a vehicle of another set relates to nothing', () => {
    const vanillaEngine = vanillaTrains.find((t) => t.kind === 'engine')!;
    expect(isPoweredOn(vanillaEngine, naan, ironHorse)).toBe(false);
  });

  it('vanilla keeps the game’s own relations', () => {
    const vanillaElrl = track(vanillaRailtypes, 'ELRL');
    const vanillaRail = track(vanillaRailtypes, 'RAIL');
    const vanillaElectric = vanillaTrains.find((t) => t.track_types[0] === 'ELRL')!;
    const vanillaSteam = vanillaTrains.find(
      (t) => t.kind === 'engine' && t.track_types[0] === 'RAIL',
    )!;
    expect(isPoweredOn(vanillaElectric, vanillaElrl, vanillaRailtypes)).toBe(true);
    expect(isPoweredOn(vanillaElectric, vanillaRail, vanillaRailtypes)).toBe(false);
    expect(isPoweredOn(vanillaSteam, vanillaElrl, vanillaRailtypes)).toBe(true);
  });
});

describe('speed on a track', () => {
  it('a high speed vehicle uses its second speed only on high speed track', () => {
    expect(vehicleSpeedOn(highSpeed, lgve)).toEqual({
      mph: highSpeed.speed_lgv_mph,
      internal: highSpeed.speed_lgv_internal,
    });
    expect(vehicleSpeedOn(highSpeed, elrl)).toEqual({
      mph: highSpeed.speed_mph,
      internal: highSpeed.speed_internal,
    });
    expect(highSpeed.speed_lgv_internal!).toBeGreaterThan(highSpeed.speed_internal!);
  });

  it('an ordinary vehicle is unaffected by high speed track', () => {
    expect(vehicleSpeedOn(electroDiesel, lgve).internal).toBe(electroDiesel.speed_internal);
  });

  it('no track of either set states a limit', () => {
    for (const table of [ironHorse, vanillaRailtypes]) {
      for (const rt of table) expect(trackSpeedLimit(rt), rt.label).toBeNull();
    }
  });

  it('a track that does state one reports it', () => {
    // no set here limits speed by track, but xUSSR-style sets do, so the model carries it
    const limited: Railtype = { ...rail, speed_limit_internal: 96 };
    expect(trackSpeedLimit(limited)).toBe(96);
  });
});

describe('power on a track', () => {
  it('an electro-diesel loses its electric power away from the wires', () => {
    expect(vehiclePowerOn(electroDiesel, elrl)).toBe(electroDiesel.power_by_source!.OHLE);
    expect(vehiclePowerOn(electroDiesel, rail)).toBe(electroDiesel.power_by_source!.DIESEL);
  });

  it('a single-source vehicle states the same power everywhere it runs', () => {
    expect(vehiclePowerOn(narrowGaugeEngine, naan)).toBe(narrowGaugeEngine.power_hp);
  });

  it('an electric engine makes no power without wires', () => {
    expect(vehiclePowerOn(electric, elrl)).toBe(electric.power_hp);
    expect(vehiclePowerOn(electric, rail)).toBe(0);
  });

  it('metro vehicles keep their power on metro track, which carries no catenary', () => {
    const metro = trains.find((t) => t.base_track_type === 'METRO' && t.power_hp > 0)!;
    expect(mtro.catenary).toBe(false);
    expect(vehiclePowerOn(metro, mtro)).toBe(metro.power_hp);
  });

  it('a vehicle without a power breakdown keeps its stated power', () => {
    expect(vehiclePowerOn({ power_hp: 1200, power_by_source: null }, rail)).toBe(1200);
  });

  it('is nothing at all where the track carries the vehicle but does not power it', () => {
    /*
     * The case that tells the two questions apart. A vehicle of electrified rail travels on
     * plain rail — the game tows it — but draws nothing there, and if its source is anything
     * other than the wires, "which source" still answers with a figure. `poweredOutputOn`
     * asks about the track first, so it answers zero; `vehiclePowerOn` alone does not.
     *
     * Nothing in either set is shaped like this today, which is why the case is built rather
     * than found: it is the shape that would let a printed figure and a computed one part
     * ways again.
     */
    const towed = {
      ...narrowGaugeEngine,
      id: 'test-towed',
      track_types: ['ELRL'],
      power_hp: 600,
      power_by_source: { DIESEL: 600 },
    };
    expect(isCompatibleWith(towed, rail, ironHorse)).toBe(true);
    expect(isPoweredOn(towed, rail, ironHorse)).toBe(false);

    expect(vehiclePowerOn(towed, rail)).toBe(600); // its source, asked on its own
    expect(poweredOutputOn(towed, rail, ironHorse)).toBe(0); // what it makes here
    expect(poweredOutputOn(towed, elrl, ironHorse)).toBe(600); // and on its own track
  });
});

describe('a track limit binds the whole consist', () => {
  const engine = trains.find((t) => t.kind === 'engine' && (t.speed_mph ?? 0) >= 80)!;
  const entries = [{ train: engine, count: 1 }];

  it('caps the consist at the track speed when the track is slower', () => {
    const limited: Railtype = { ...rail, speed_limit_internal: mphToInternal(40) };
    const free = consistPhysics(entries, null, 2, IRON_HORSE_GAME, rail);
    const capped = consistPhysics(entries, null, 2, IRON_HORSE_GAME, limited);
    expect(free.stats.speedLimitInternal).toBe(engine.speed_internal);
    expect(capped.stats.speedLimitInternal).toBe(limited.speed_limit_internal);
    expect(capped.physics.maxSpeedInternal).toBeLessThan(free.physics.maxSpeedInternal);
  });

  it('leaves a consist slower than the track alone', () => {
    const limited: Railtype = { ...rail, speed_limit_internal: mphToInternal(200) };
    const capped = consistPhysics(entries, null, 2, IRON_HORSE_GAME, limited);
    expect(capped.stats.speedLimitInternal).toBe(engine.speed_internal);
  });

  it('a slower track means a slower run and a longer leg', () => {
    const limited: Railtype = { ...rail, speed_limit_internal: mphToInternal(40) };
    const free = consistPhysics(entries, null, 2, IRON_HORSE_GAME, rail);
    const capped = consistPhysics(entries, null, 2, IRON_HORSE_GAME, limited);
    const speedOn = (physics: typeof free.physics) =>
      balancingSpeed(physics, 0, IRON_HORSE_GAME.accelerationModel);
    expect(speedOn(capped.physics)).toBeLessThan(speedOn(free.physics));
    expect(daysForDistance(200, speedOn(capped.physics))).toBeGreaterThan(
      daysForDistance(200, speedOn(free.physics)),
    );
  });
});

describe('which tracks are offered as a choice', () => {
  it('leaves out a track the game hides from its build menu', () => {
    // Iron Horse defines plain LGV only so high speed vehicles stay compatible with
    // ordinary track (RAILTYPE_FLAG_HIDDEN); nobody can lay it, so it is no route to cost
    const hidden = ironHorse.filter((rt) => rt.hidden).map((rt) => rt.label);
    expect(hidden).toEqual(['LGVN']);
    expect(selectableRailtypes(IRON_HORSE_GAME).map((rt) => rt.label)).not.toContain('LGVN');
    // it stays in the table, where the relations still need it
    expect(activeRailtypes(IRON_HORSE_GAME).map((rt) => rt.label)).toContain('LGVN');
  });

  it('the game hides none of its own', () => {
    expect(vanillaRailtypes.filter((rt) => rt.hidden)).toEqual([]);
  });
});

describe('power source order', () => {
  it('follows the set’s hierarchy rather than the largest figure', () => {
    // Iron Horse ranks OHLE > METRO > BATTERY_HYBRID > DIESEL > STEAM and builds its power
    // switch in that order, so a weaker-but-higher-ranked source still wins
    const oddball = { power_hp: 0, power_by_source: { DIESEL: 5000, OHLE: 100 } };
    expect(vehiclePowerOn(oddball, elrl)).toBe(100);
    expect(vehiclePowerOn(oddball, rail)).toBe(5000);
  });

  it('a source the order does not name still moves the vehicle', () => {
    // whatever a future set invents: unfamiliar is not the same as unpowered
    expect(vehiclePowerOn({ power_hp: 0, power_by_source: { FUSION: 700 } }, rail)).toBe(700);
  });

  it('the vanilla drives are named by the order', () => {
    for (const source of ['MONORAIL', 'MAGLEV']) {
      expect(vehiclePowerOn({ power_hp: 0, power_by_source: { [source]: 500 } }, rail)).toBe(500);
    }
  });

  it('vanilla monorail and maglev keep their power', () => {
    const mono = vanillaTrains.find((t) => t.track_types[0] === 'MONO' && t.power_hp > 0)!;
    const monoTrack = track(vanillaRailtypes, 'MONO');
    expect(vehiclePowerOn(mono, monoTrack)).toBe(mono.power_hp);
  });
});

describe('tractive effort follows power', () => {
  it('a vehicle that makes no power here pulls nothing', () => {
    // the game adds tractive effort only for parts that are powered on this tile
    const entries = [{ train: electric, count: 1 }];
    const underWires = consistPhysics(entries, null, 2, IRON_HORSE_GAME, elrl);
    const withoutWires = consistPhysics(entries, null, 2, IRON_HORSE_GAME, rail);
    expect(underWires.stats.maxTeN).toBeGreaterThan(0);
    expect(withoutWires.stats.powerHp).toBe(0);
    expect(withoutWires.stats.maxTeN).toBe(0);
  });

  it('a vehicle of another gauge makes nothing here either, not just electrics', () => {
    // The wires are only one way to be unpowered. A metro or narrow gauge engine left on
    // plain rail is not powered there at all — the game asks `HasPowerOnRail` before it
    // counts any power (train_cmd.cpp), so its diesel or third-rail figure is beside the
    // point. Reading the source alone would have the summary show its full power on a track
    // it cannot run on, and the warning above the summary would be saying otherwise.
    for (const stranded of [byId.get('debden')!, narrowGaugeEngine]) {
      expect(isPoweredOn(stranded, rail, ironHorse)).toBe(false);
      expect(vehiclePowerOn(stranded, rail)).toBeGreaterThan(0); // its source says otherwise
      const consist = consistPhysics(
        [{ train: stranded, count: 1 }], null, 2, IRON_HORSE_GAME, rail,
      );
      expect(consist.stats.powerHp, stranded.id).toBe(0);
      expect(consist.stats.maxTeN, stranded.id).toBe(0);
    }

    // and on its own track the same engine is itself again
    const metro = byId.get('debden')!;
    const home = consistPhysics([{ train: metro, count: 1 }], null, 2, IRON_HORSE_GAME, mtro);
    expect(home.stats.powerHp).toBeGreaterThan(0);
    expect(home.stats.maxTeN).toBeGreaterThan(0);
  });
});

describe('the optimizer searches the chosen track', () => {
  const params = {
    year: 1950,
    distanceTiles: 80,
    cargo: cargoByLabel.get('COAL')!,
    economyId: 'STEELTOWN',
    maxLengthTiles: 5,
    game: IRON_HORSE_GAME,
  };
  const search = (trackType: string) =>
    optimizeConsists(trains, { ...params, calc: { ...DEFAULT_CALC_SETTINGS, trackType } }, trainsMeta, 5);

  it('narrow gauge has consists of its own', () => {
    // the set states no mask for narrow gauge at all: without normalising it, this comes
    // back empty and reads as "no vehicles yet" rather than as a bug
    const rows = search('NAAN');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.engine.base_track_type).toBe('NG');
      expect(row.wagon.base_track_type).toBe('NG');
    }
  });

  it('plain rail offers no pure electric, electrified rail does', () => {
    const isPureElectric = (t: { power_by_source: Record<string, number> | null }) =>
      t.power_by_source != null && Object.keys(t.power_by_source).every((s) => s === 'OHLE');
    expect(search('RAIL').some((r) => isPureElectric(r.engine))).toBe(false);
    expect(search('ELRL').some((r) => isPureElectric(r.engine))).toBe(true);
  });

  it('sweeps wagons the track tells apart, however alike their fields are', () => {
    // The sweep runs one representative per group of wagons that agree on every number it
    // reads. Now that the track decides power, two wagons alike in every field can still
    // make different power here — a powered trailer drawing from the wires against one
    // drawing from a diesel — and folding them together would search only one of them.
    const passengers = cargoByLabel.get('PASS')!;
    const highSpeedRun = {
      year: 2000,
      distanceTiles: 200,
      cargo: passengers,
      economyId: 'STEELTOWN',
      maxLengthTiles: 7,
      game: IRON_HORSE_GAME,
      calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'LGVE' },
    };
    const [best] = optimizeConsists(trains, highSpeedRun, trainsMeta, 5);

    // Identical in every stated field but one the track reads: on high speed track the
    // capable wagon runs at its second, higher speed and the plain one holds the train to
    // its first. The ids are picked so the *slower* one would be the representative if the
    // two were folded together (preferTrain settles ties by id) — which is what a profile
    // blind to these fields would do.
    const slow = { ...best.wagon, id: 'test-a-plain', name: 'Plain', lgv_capable: false };
    const fast = {
      ...best.wagon,
      id: 'test-b-capable',
      name: 'Capable',
      lgv_capable: true,
      speed_mph: 60,
      speed_internal: mphToInternal(60),
      speed_lgv_mph: 200,
      speed_lgv_internal: mphToInternal(200),
    };
    const slowed = { ...slow, speed_mph: 60, speed_internal: mphToInternal(60) };

    const rows = optimizeConsists(
      [best.engine, slowed, fast],
      highSpeedRun,
      trainsMeta,
      30,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].wagon.id).toBe('test-b-capable');
  });
});

describe('a hidden track still does its job', () => {
  it('vehicles that belong to it are unaffected by its being hidden', () => {
    // blaze_cab is a high speed vehicle of the hidden LGVN type; hiding the track from the
    // choice must not strand it — it still runs on ordinary rail and on electrified LGV
    const hiddenTrack = track(ironHorse, 'LGVN');
    expect(hiddenTrack.hidden).toBe(true);
    expect(highSpeed.track_types).toContain('LGVN');
    expect(isPoweredOn(highSpeed, rail, ironHorse)).toBe(true);
    expect(isPoweredOn(highSpeed, lgve, ironHorse)).toBe(true);
    // and it is still the vehicle the optimizer offers on those tracks
    const rows = optimizeConsists(
      trains,
      {
        year: 2000,
        distanceTiles: 200,
        cargo: cargoByLabel.get('PASS')!,
        economyId: 'STEELTOWN',
        maxLengthTiles: 7,
        game: IRON_HORSE_GAME,
        calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'LGVE' },
      },
      trainsMeta,
      30,
    );
    expect(rows.some((r) => r.engine.lgv_capable)).toBe(true);
  });

  it('is never the track a consist is read as running on', () => {
    // A route's track is inferred from the trains that run it, and the player cannot have
    // built one the game keeps out of the build menu. Iron Horse's own hidden track leads
    // back onto its electrified twin, so the case needs a set whose hidden track leads
    // nowhere — which a set is free to ship.
    const hiddenOnly: Railtype = {
      ...rail, label: 'HIDE', hidden: true, powered: ['HIDE'], compatible: ['HIDE'],
    };
    const table = [hiddenOnly, rail];
    const stuck = { ...highSpeed, id: 'test-hidden-only', track_types: ['HIDE'] };

    expect(canRunOn(stuck, hiddenOnly, table)).toBe(true);
    expect(trackTypeOfConsist([{ train: stuck, count: 1 }], table)).toBeNull();
    // and a vehicle that also fits buildable track is answered with that one
    const free = { ...stuck, id: 'test-both', track_types: ['HIDE', 'RAIL'] };
    expect(trackTypeOfConsist([{ train: free, count: 1 }], table)!.label).toBe('RAIL');
  });
});

describe('the vanilla catalogue keeps its gauges apart', () => {
  // each gauge has its own era: monorail engines arrive in 1998, maglev in 2020, and the
  // early rail engines are out of production long before either
  const search = (trackType: string, year: number) =>
    optimizeConsists(
      vanillaTrains,
      {
        year,
        distanceTiles: 80,
        // the vanilla coal, which has a payment rate in the vanilla economy
        cargo: vanillaCargos.find((c) => c.label === 'COAL')!,
        economyId: 'VANILLA',
        maxLengthTiles: 5,
        game: DEFAULT_GAME_SETTINGS,
        calc: { ...DEFAULT_CALC_SETTINGS, trackType },
      },
      activeTrainsMeta(DEFAULT_GAME_SETTINGS),
      20,
    );

  it('plain rail offers neither monorail nor maglev', () => {
    const rows = search('RAIL', 1980);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.engine.base_track_type).toBe('RAIL');
      expect(row.wagon.base_track_type).toBe('RAIL');
    }
  });

  it('each of the game\u2019s gauges searches its own vehicles', () => {
    for (const [label, family, year] of [
      ['MONO', 'MONO', 2005],
      ['MGLV', 'MAGLEV', 2030],
    ] as const) {
      const rows = search(label, year);
      expect(rows.length, label).toBeGreaterThan(0);
      for (const row of rows) expect(row.engine.base_track_type, label).toBe(family);
    }
  });

  it('an electric engine needs the wires here too', () => {
    const isElectric = (v: { power_by_source: Record<string, number> | null }) =>
      v.power_by_source != null && Object.keys(v.power_by_source).every((s) => s === 'OHLE');
    expect(search('RAIL', 1980).some((r) => isElectric(r.engine))).toBe(false);
    expect(search('ELRL', 1980).some((r) => isElectric(r.engine))).toBe(true);
  });
});

describe('the track a consist must be on', () => {
  const table = ironHorse;

  it('an electric train is read as running under wires', () => {
    // a savegame states the trains, not the track; assuming plain rail would report this
    // train as making no power at all
    const track = trackTypeOfConsist([{ train: electric, count: 1 }], table)!;
    expect(track.label).toBe('ELRL');
    expect(vehiclePowerOn(electric, track)).toBe(electric.power_hp);
  });

  it('a diesel train is not read as needing wires it does not use', () => {
    const diesel = trains.find(
      (t) => t.kind === 'engine' && t.power_by_source?.DIESEL && !t.power_by_source?.OHLE,
    )!;
    expect(trackTypeOfConsist([{ train: diesel, count: 1 }], table)!.label).toBe('RAIL');
  });

  it('a narrow gauge train is read as running on narrow gauge', () => {
    expect(trackTypeOfConsist([{ train: narrowGaugeEngine, count: 1 }], table)!.label).toBe('NAAN');
  });

  it('every part has to fit: the wagons decide as much as the engine', () => {
    const ngWagon = trains.find((t) => t.kind === 'wagon' && t.base_track_type === 'NG')!;
    // an engine of one gauge with wagons of another runs nowhere
    expect(trackTypeOfConsist(
      [{ train: electric, count: 1 }, { train: ngWagon, count: 1 }],
      table,
    )).toBeNull();
  });

  it('an empty consist has no track', () => {
    expect(trackTypeOfConsist([], table)).toBeNull();
    expect(trackTypeOfConsist([{ train: electric, count: 0 }], table)).toBeNull();
  });
});
