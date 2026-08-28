/**
 * What a track type does to a vehicle: whether it runs there at all, how fast, and on
 * what power.
 *
 * Two relations, both stated by the sets and normalised on extraction (see
 * pipeline/extract_iron_horse.py): a vehicle is **powered** on a track when it pulls
 * under its own power there, and **compatible** with it when it can physically travel
 * there, towed if need be. An engine that is merely compatible would move at zero power,
 * so engines are offered where they are powered; for wagons compatibility is enough.
 *
 * The masks are stated from the side of the vehicle's own type: `powered` of type L
 * lists the tracks a vehicle of type L draws power on (rail.h:176-181). A vehicle can
 * belong to several types — an electro-diesel is both plain and electrified rail — so it
 * relates to a track when any of its types does.
 */
import type { Railtype, Train } from '../types';

type TrackTable = readonly Railtype[];

/**
 * Power sources from strongest to weakest, as Iron Horse orders them when it builds the
 * switch chain a vehicle picks its power with (global_constants.py `power_sources`,
 * schemas.py `vehicle_power_source_tree`). The set states the hierarchy rather than
 * comparing figures, so the calculator follows the same order instead of taking whichever
 * number happens to be largest.
 */
const POWER_SOURCE_ORDER = [
  'OHLE', 'METRO', 'BATTERY_HYBRID', 'DIESEL', 'STEAM',
  // the vanilla set's own drives, which never share a vehicle with anything else
  'MONORAIL', 'MAGLEV',
];

function relates(
  train: Pick<Train, 'track_types'>,
  track: Railtype,
  table: TrackTable,
  mask: 'powered' | 'compatible',
): boolean {
  return train.track_types.some((label) => {
    // a type the active set does not have: the vehicle belongs to another set
    const own = table.find((rt) => rt.label === label);
    return own?.[mask].includes(track.label) ?? false;
  });
}

/** Does this vehicle pull under its own power on this track? */
export function isPoweredOn(
  train: Pick<Train, 'track_types'>,
  track: Railtype,
  table: TrackTable,
): boolean {
  return relates(train, track, table, 'powered');
}

/** Can this vehicle travel on this track, under its own power or towed? */
export function isCompatibleWith(
  train: Pick<Train, 'track_types'>,
  track: Railtype,
  table: TrackTable,
): boolean {
  return relates(train, track, table, 'compatible');
}

/**
 * Can this vehicle be part of a train on this track?
 *
 * The rule the whole calculator uses, in one place: an engine has to be **powered** —
 * merely fitting the gauge would put it there at zero power — while a wagon only has to be
 * **compatible**, since something else pulls it.
 */
export function canRunOn(
  train: Pick<Train, 'kind' | 'track_types'>,
  track: Railtype,
  table: TrackTable,
): boolean {
  return train.kind === 'engine'
    ? isPoweredOn(train, track, table)
    : isCompatibleWith(train, track, table);
}

/**
 * The track a consist must be running on, read off the consist itself.
 *
 * A savegame states which trains run a route but not what they run on — the calculator does
 * not read the map — and the track decides power and speed, so assuming plain rail would
 * report an electric train as making no power at all. What the vehicles allow is a better
 * answer than a default: the first track every part of the consist can work on is one the
 * player must have built, because their train is on it.
 *
 * Ties are settled by the order of the table, which is the order of the game's own build
 * menu: plain rail before electrified, so a diesel train is not read as running under wires
 * it does not need. A track the game hides from that menu is no answer at all — the player
 * cannot have built what they cannot lay — so only buildable track is considered, while the
 * relations are still read from the whole table.
 */
export function trackTypeOfConsist(
  entries: readonly { train: Pick<Train, 'kind' | 'track_types'>; count: number }[],
  table: TrackTable,
): Railtype | null {
  const parts = entries.filter((entry) => entry.count > 0);
  if (!parts.length) return null;
  return table
    .filter((track) => !track.hidden)
    .find((track) => parts.every(({ train }) => canRunOn(train, track, table))) ?? null;
}

/** The track's own speed limit in internal units, or null when it sets none. */
export function trackSpeedLimit(track: Railtype | null | undefined): number | null {
  return track?.speed_limit_internal ? track.speed_limit_internal : null;
}

/**
 * Top speed a vehicle reaches on this track: its own limit under the track's.
 *
 * A vehicle that states no speed of its own — most wagons — has none here either: the
 * track's limit belongs to the train it ends up in, not to the wagon, and printing it in
 * the wagon's own column would invent a limit the data never gave it.
 */
export function topSpeedOn(
  train: Parameters<typeof vehicleSpeedOn>[0],
  track: Railtype | null | undefined,
): number | null {
  const own = vehicleSpeedOn(train, track).internal;
  if (own == null) return null;
  const limit = trackSpeedLimit(track);
  return limit == null ? own : Math.min(own, limit);
}

/**
 * Top speed of this vehicle on this track, in both units the calculator keeps.
 *
 * High speed track raises it rather than capping it: a vehicle built for it states a
 * second, higher speed that applies only there (Iron Horse templates/speed.pynml). The
 * track's own limit is not applied here — it belongs to the whole consist, not to one
 * vehicle, so `consistPhysics` takes it once over the finished train.
 *
 * Both units travel together because they are not interchangeable here: physics computes
 * from mph on purpose (see `consistPhysics`), while what the interface shows comes from
 * the internal figure the data states.
 */
export function vehicleSpeedOn(
  train: Pick<
    Train, 'speed_mph' | 'speed_internal' | 'speed_lgv_mph' | 'speed_lgv_internal' | 'lgv_capable'
  >,
  track: Railtype | null | undefined,
): { mph: number | null; internal: number | null } {
  if (track?.lgv && train.lgv_capable && train.speed_lgv_mph) {
    return { mph: train.speed_lgv_mph, internal: train.speed_lgv_internal };
  }
  return { mph: train.speed_mph, internal: train.speed_internal };
}

/**
 * Power this vehicle actually contributes on this track, in hp — the one figure the whole
 * calculator asks for, so a cell and the sum below it cannot disagree.
 *
 * Being powered comes first: a vehicle the track does not power makes nothing there, whatever
 * its source says. The game asks `HasPowerOnRail` before it counts any power (train_cmd.cpp),
 * which is what keeps a metro or narrow gauge engine from pulling on plain rail — the wires
 * are only one of the ways to be unpowered.
 */
export function poweredOutputOn(
  train: Pick<Train, 'track_types' | 'power_hp' | 'power_by_source'>,
  track: Railtype,
  table: TrackTable,
): number {
  return isPoweredOn(train, track, table) ? vehiclePowerOn(train, track) : 0;
}

/**
 * Power this vehicle's own source would produce on this track, in hp — without asking whether
 * the track powers it at all. Callers that have the set's table want `poweredOutputOn`.
 *
 * A vehicle with more than one power source produces a different figure on each: an
 * electro-diesel gives its electric power under the wires and its diesel power away from
 * them (Iron Horse alt_vars_powered_by_railtype.pynml, where the switch asks the tile
 * which railtype powers it). Overhead power counts only where the track carries wires;
 * everything else — diesel, steam, metro's third rail, batteries — works anywhere the
 * vehicle is allowed.
 */
export function vehiclePowerOn(
  train: Pick<Train, 'power_hp' | 'power_by_source'>,
  track: Railtype | null | undefined,
): number {
  const sources = train.power_by_source;
  if (!sources) return train.power_hp;
  // overhead power counts only where the track carries wires; every other source — diesel,
  // steam, metro's third rail, batteries, the vanilla monorail and maglev drives — works
  // anywhere the vehicle is allowed at all
  const usable = Object.keys(sources).filter((source) => source !== 'OHLE' || track?.catenary);
  // the strongest source the order names, or, for a source it does not name yet, the one
  // the data states: an unfamiliar source should leave a vehicle running, not stranded
  const chosen = POWER_SOURCE_ORDER.find((source) => usable.includes(source)) ?? usable[0];
  return chosen ? sources[chosen] : 0;
}
