/**
 * Small decisions the game tab makes about a snapshot, kept out of the components so they can
 * be tested on their own.
 */

import type { SnapshotCompany, SnapshotGroup, SnapshotTrain } from '../../savegame/snapshot';
import type { SnapshotSettings } from '../../savegame/snapshotStore';
import { SETTING_LABEL_KEYS } from './settingNames';

/**
 * The company the tab opens on: the first one a human plays, since that is whose network the
 * user came to look at. A game of AIs only still opens on something rather than nothing.
 */
export function defaultCompanyId(companies: readonly SnapshotCompany[]): number {
  return (companies.find((company) => !company.isAi) ?? companies[0])?.id ?? 0;
}

/**
 * Settings the tab does not compare, because its forecasts do not read them either. The
 * track type is one: a route's track is read off the consist that runs it (`routeRows`),
 * not taken from the calculator, so a different choice on the searching tabs moves none of
 * these figures — and naming it as a difference would send the user looking for a drift
 * that is not there.
 */
const NOT_USED_BY_THE_FORECAST = new Set<keyof SnapshotSettings['calc']>(['trackType']);

/**
 * Translation keys of the settings that have drifted since the import, so the tab can say
 * which figures its forecasts are not using. Compared field by field: what matters to the
 * user is that the calculator now stands somewhere else, not by how much.
 *
 * Keys, not translated names: the caller translates them while rendering, or the list would
 * hold the language it was built in (see the i18n note in CLAUDE.md).
 */
export function differingSettings(
  snapshot: SnapshotSettings,
  current: SnapshotSettings,
): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(snapshot.game) as (keyof SnapshotSettings['game'])[]) {
    if (snapshot.game[key] !== current.game[key]) keys.push(SETTING_LABEL_KEYS[key]);
  }
  for (const key of Object.keys(snapshot.calc) as (keyof SnapshotSettings['calc'])[]) {
    if (NOT_USED_BY_THE_FORECAST.has(key)) continue;
    if (snapshot.calc[key] !== current.calc[key]) keys.push(SETTING_LABEL_KEYS[key]);
  }
  return keys;
}

/**
 * Whether the game has a finished year behind it to compare a yearly forecast against.
 *
 * The savegame states no founding date the calculator reads, so the answer comes from the
 * trains themselves: if not one of them earned or lost anything last year, there is no last
 * year — the game is in its first, or the company only started running this year. Either way
 * the fact and the forecast are not comparable, and the tab says so instead of holding up a
 * zero as if it were a result.
 */
export function hasFinishedYear(trains: readonly SnapshotTrain[]): boolean {
  return trains.some((train) => train.profitLastYear !== 0);
}

/**
 * Every group under this one, itself included — the game's own train list filters that way, so
 * picking a parent group shows the trains of its children too.
 */
export function groupWithDescendants(
  groups: readonly SnapshotGroup[],
  rootId: number,
): Set<number> {
  const children = childrenByParent(groups);
  const out = new Set<number>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(children.get(id) ?? []).map((group) => group.id));
  }
  return out;
}

/**
 * Groups of one company as a flat list of options, children following their parent and
 * indented by depth — the shape the game's own group pane has.
 */
export function groupOptions(
  groups: readonly SnapshotGroup[],
  companyId: number,
): { id: number; label: string; depth: number }[] {
  const mine = groups.filter((group) => group.companyId === companyId);
  const byParent = childrenByParent(mine);
  const out: { id: number; label: string; depth: number }[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null, depth: number) => {
    for (const group of byParent.get(parent) ?? []) {
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      out.push({ id: group.id, label: group.name, depth });
      walk(group.id, depth + 1);
    }
  };
  walk(null, 0);
  // a group whose parent belongs to another company hangs from nothing here; it heads its
  // own subtree rather than being dropped along with everything under it
  const known = new Set(mine.map((group) => group.id));
  for (const group of mine) {
    if (group.parent !== null && !known.has(group.parent) && !seen.has(group.id)) {
      seen.add(group.id);
      out.push({ id: group.id, label: group.name, depth: 0 });
      walk(group.id, 1);
    }
  }
  return out;
}

/** Children of each group, by the id of their parent — `null` heads the top level. */
function childrenByParent(
  groups: readonly SnapshotGroup[],
): Map<number | null, SnapshotGroup[]> {
  const out = new Map<number | null, SnapshotGroup[]>();
  for (const group of groups) {
    const siblings = out.get(group.parent);
    if (siblings === undefined) out.set(group.parent, [group]);
    else siblings.push(group);
  }
  return out;
}
