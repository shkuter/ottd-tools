/**
 * Whether the chains of an economy can be closed on the map a game was generated with.
 *
 * A different question to the one `ChainTasks` answers. That one is about what the player
 * built — a cargo reaches an industry or nothing hauls it yet. This one is about what the
 * generator placed: a secondary can stand where no producer of its inputs exists anywhere,
 * and no amount of track will fix that (ADR-0009). Nothing here reads routes, stations or
 * distances.
 */
import { cargoByLabel, industryById } from '../../dataset';
import { conversion } from '../../engine/supply';
import { intlLocale } from '../../i18n';
import { cargoName, industryName } from '../../i18n/names';
import type { Snapshot } from '../../savegame/snapshot';
import type { Locale } from '../../state/localeStore';
import type { Economy, Industry } from '../../types';
import { carriesTheChain, producerIndex } from './dependencies';

/** One industry type of the map, with what the map lets it do. */
export interface MapIndustry {
  industry: Industry;
  /** Instances of this type standing on the map. */
  count: number;
  /** Share of its output the map lets it reach, 0..1. */
  reachableShare: number;
}

/**
 * An industry type absent from the map, with the gaps building one would repair.
 *
 * `industry` is null for the gaps no single build revives — industries waiting on each other,
 * or a chain missing more than one link. They are real gaps and have to be shown; there is
 * simply nothing to name as the one fix.
 */
export interface MissingLink {
  industry: Industry | null;
  blocked: MapIndustry[];
  /** Industries this one build would start — instances, not types. */
  starts: number;
}

/** A cargo the map produces and nothing on the map accepts. */
export interface DeadEnd {
  cargoLabel: string;
  producers: MapIndustry[];
}

export interface Completeness {
  /**
   * Every industry type standing on the map, with the share this map lets it reach. The
   * lists below are drawn from it; it is stated separately because the share is an answer in
   * its own right, and the one the other three are derived from.
   */
  industries: MapIndustry[];
  /** Chain gaps, grouped by the build that would repair them, the biggest repair first. */
  gaps: MissingLink[];
  deadEnds: DeadEnd[];
  /** Supply cargoes of the economy nothing on the map can make. */
  missingSupplies: string[];
  /** Industries of the save the catalogue does not know: they may make what we call absent. */
  unknownCount: number;
}

export interface CompletenessOptions {
  economy: Economy;
  /** Catalogue ids of the industries standing on the map, one entry per instance. */
  onMap: readonly string[];
  unknownCount?: number;
  locale: Locale;
  /** The industry catalogue; overridable so a test can state a set of its own. */
  catalogue?: ReadonlyMap<string, Industry>;
}

/** What every step of the walk needs: the economy, the map, and who makes what. */
interface Placement {
  economy: Economy;
  /** Instances per type standing on the map. */
  counts: ReadonlyMap<string, number>;
  /** Cargo label to the ids of the industries of this economy producing it. */
  producers: ReadonlyMap<string, string[]>;
  catalogue: ReadonlyMap<string, Industry>;
}

/**
 * What an imported game states about its map: one entry per industry standing on it, and how
 * many of them the catalogue cannot name.
 *
 * Reads `industries` alone. Routes, stations and trains say what the player built, which is a
 * different question and a different list (ADR-0009).
 */
export function industriesOnMap(snapshot: Snapshot): { onMap: string[]; unknownCount: number } {
  const onMap: string[] = [];
  let unknownCount = 0;
  for (const industry of snapshot.industries) {
    if (industry.catalogueId === null) unknownCount += 1;
    else onMap.push(industry.catalogueId);
  }
  return { onMap, unknownCount };
}

/** Industries standing behind a set of rows: what "how many industries" always means here. */
function instances(rows: readonly MapIndustry[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

/** Names as the reader sees them: every list of the app is ordered by those, not by labels. */
function namesIn(placement: Placement, locale: Locale) {
  const collator = new Intl.Collator(intlLocale(locale));
  const industry = (found: Industry | null) =>
    found === null ? '' : industryName(found, placement.economy.id, locale);
  return {
    industry,
    cargo: (label: string) => cargoName(cargoByLabel.get(label), locale),
    byIndustry: (a: MapIndustry, b: MapIndustry) =>
      collator.compare(industry(a.industry), industry(b.industry)),
    compare: (a: string, b: string) => collator.compare(a, b),
  };
}

export function chainCompleteness(options: CompletenessOptions): Completeness {
  const { economy, onMap, locale, unknownCount = 0, catalogue = industryById } = options;
  const placement: Placement = {
    economy,
    counts: countByType(economy, onMap, catalogue),
    producers: producerIndex(economy, catalogue),
    catalogue,
  };
  const workable = solveWorkable(placement);
  const rows = [...placement.counts].map(([id, count]) => ({
    industry: catalogue.get(id)!,
    count,
    reachableShare: reachableShare(placement, catalogue.get(id)!, workable),
  }));

  return {
    industries: rows,
    gaps: groupByMissingLink(placement, rows, locale),
    deadEnds: deadEnds(placement, rows, workable, locale),
    missingSupplies: missingSupplies(placement, workable, locale),
    unknownCount,
  };
}

/**
 * Supply cargoes this map cannot make: in the economy at all, and produced by nobody on the
 * map who can run.
 *
 * The set states one list of supply labels for every economy, so four of the five name WELD
 * and SEAL, which their own industries never handle — `cargo_labels` is what an economy
 * really has, and a cargo outside it is not a missing source, it simply does not exist here.
 */
function missingSupplies(
  placement: Placement,
  workable: ReadonlySet<string>,
  locale: Locale,
): string[] {
  const names = namesIn(placement, locale);
  const inEconomy = new Set(placement.economy.cargo_labels);
  return placement.economy.graph.supply_labels
    .filter(
      (label) =>
        inEconomy.has(label) &&
        !(placement.producers.get(label) ?? []).some((id) => workable.has(id)),
    )
    .sort((a, b) => names.compare(names.cargo(a), names.cargo(b)));
}

/** Instances per type, ignoring anything this economy does not have. */
function countByType(
  economy: Economy,
  onMap: readonly string[],
  catalogue: ReadonlyMap<string, Industry>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of onMap) {
    if (!catalogue.get(id)?.economies[economy.id]) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The industries of the map that can produce something here, as the least fixed point of
 * "one of my inputs comes from someone who can produce".
 *
 * Starts with everything whose output does not follow from deliveries — primaries, ports,
 * pool industries, tertiaries — and grows until it stops. Solved this way rather than by a
 * depth-first walk because a chain feeding only itself needs no special case: it simply
 * never joins the set, which is what being unworkable means.
 */
function solveWorkable(placement: Placement): Set<string> {
  const workable = new Set<string>();
  for (const id of placement.counts.keys()) {
    if (!carriesTheChain(placement.catalogue.get(id)!)) workable.add(id);
  }
  for (;;) {
    let grew = false;
    for (const id of placement.counts.keys()) {
      if (workable.has(id)) continue;
      if (reachableShare(placement, placement.catalogue.get(id)!, workable) > 0) {
        workable.add(id);
        grew = true;
      }
    }
    if (!grew) return workable;
  }
}

/**
 * Share of its output an industry can reach, given who can already produce.
 *
 * 1 for anything that does not convert: its output does not follow from what it is fed.
 * Supply cargoes are counted like any other input — `graph.supply_labels` says the graph does
 * not draw them, not that the game leaves them out of the conversion, and in Steeltown five
 * secondaries reach the ceiling only with theirs (`plate_mill` is STSL 6 + WELD 2).
 */
function reachableShare(placement: Placement, industry: Industry, workable: ReadonlySet<string>): number {
  if (!carriesTheChain(industry)) return 1;
  const supplied: number[] = [];
  for (const input of industry.economies[placement.economy.id]?.accepts ?? []) {
    // membership answers both halves at once: the producer stands on the map — or is the
    // candidate being tried out on it — and it can run
    const made = placement.producers.get(input.label) ?? [];
    if (made.some((id) => workable.has(id))) supplied.push(input.ratio ?? 0);
  }
  return conversion(supplied);
}

/**
 * The gaps of the map, grouped by what building one thing would repair.
 *
 * A candidate is tried rather than reasoned about: put one industry of that type on the map,
 * solve workability again, and see which gaps come alive. Walking the chain upwards instead
 * would name a coke oven on a map with no coal — a build that changes nothing, because the
 * oven would not run either.
 */
function groupByMissingLink(placement: Placement, rows: MapIndustry[], locale: Locale): MissingLink[] {
  const gaps = rows.filter((row) => row.reachableShare === 0);
  if (gaps.length === 0) return [];

  const names = namesIn(placement, locale);
  const sorted = (blocked: MapIndustry[]) => [...blocked].sort(names.byIndustry);

  const links: MissingLink[] = [];
  const revived = new Set<string>();
  for (const id of placement.economy.industry_ids) {
    if (placement.counts.has(id)) continue;
    const candidate = placement.catalogue.get(id);
    if (!candidate) continue;
    const withIt: Placement = { ...placement, counts: new Map(placement.counts).set(id, 1) };
    // the fixed point is exactly the set with a share above zero, so it is the answer
    const workable = solveWorkable(withIt);
    const blocked = gaps.filter((row) => workable.has(row.industry.id));
    if (blocked.length === 0) continue;
    for (const row of blocked) revived.add(row.industry.id);
    links.push({ industry: candidate, blocked: sorted(blocked), starts: instances(blocked) });
  }
  links.sort(
    (a, b) => b.starts - a.starts || names.compare(names.industry(a.industry), names.industry(b.industry)),
  );

  const stuck = gaps.filter((row) => !revived.has(row.industry.id));
  // last, because it is the one group the player cannot act on with a single build
  if (stuck.length > 0) {
    links.push({ industry: null, blocked: sorted(stuck), starts: instances(stuck) });
  }
  return links;
}

/**
 * Cargoes the map makes and nothing on the map takes.
 *
 * A cargo, not an industry: 27 Steeltown industries make more than one, so an industry can
 * have a buyer for one output and none for another. Only what a workable industry produces
 * counts — an industry that cannot run strands nothing.
 */
function deadEnds(
  placement: Placement,
  rows: MapIndustry[],
  workable: ReadonlySet<string>,
  locale: Locale,
): DeadEnd[] {
  // read off every industry of the map, working or not: acceptance does not depend on
  // production, so a stranded cargo is one nothing here would take even once fed
  const accepted = new Set<string>();
  for (const id of placement.counts.keys()) {
    for (const input of placement.catalogue.get(id)!.economies[placement.economy.id]?.accepts ?? []) {
      accepted.add(input.label);
    }
  }
  const byCargo = new Map<string, MapIndustry[]>();
  for (const row of rows) {
    if (!workable.has(row.industry.id)) continue;
    for (const output of row.industry.economies[placement.economy.id]?.produces ?? []) {
      if (accepted.has(output.label)) continue;
      const made = byCargo.get(output.label);
      if (made) made.push(row);
      else byCargo.set(output.label, [row]);
    }
  }

  // ordered by what one fix is worth, then by what the reader sees — as the gaps are
  const names = namesIn(placement, locale);
  return [...byCargo.entries()]
    .map(([cargoLabel, producers]) => ({ cargoLabel, producers: [...producers].sort(names.byIndustry) }))
    .sort(
      (a, b) =>
        instances(b.producers) - instances(a.producers) ||
        names.compare(names.cargo(a.cargoLabel), names.cargo(b.cargoLabel)),
    );
}
