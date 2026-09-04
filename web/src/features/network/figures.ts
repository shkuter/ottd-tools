import { useMemo } from 'react';
import { activeRailtype, activeTrains, availabilityContext, selectableRailtypes } from '../../dataset';
import { t } from '../../i18n';
import { railtypeOptions } from '../../i18n/names';
import {
  corridorUpgrade,
  replacementCandidates,
  type CorridorUpgradeResult,
} from '../../engine/corridorUpgrade';
import {
  networkMaintenance,
  type MaintenanceLine,
  type NetworkMaintenance,
} from '../../engine/infrastructure';
import { signalInputs, signalPlan, type SignalDensityResult } from '../../engine/signals';
import type { RouteWithFlowParams } from '../../engine/trip';
import type { Railtype, Train } from '../../types';
import { networkCounts, useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useSoldIds } from '../savegame/soldIds';

/*
 * One definition of each answer, read by both the panel that shows it and the summary that
 * ranks it. (Each hook runs in both, so an engine is called twice per render; what the shared
 * definition buys is that the two calls cannot be given different arguments — which is how a
 * summary and a panel start stating different numbers about the same network.)
 */

/** A railtype and the name this language gives it, as the fields and lists show it. */
export type NamedRailtype = { railtype: Railtype; name: string };

/**
 * What a billed line is called. Only the rail side is asked for, so only it is named — and
 * both the panel and the summary name it from here, or the same line would read two ways on
 * one page.
 */
export function lineName(line: MaintenanceLine, options: readonly NamedRailtype[]): string {
  if (line.category === 'signal') return t('network.signals');
  if (line.category === 'station') return t('network.stations');
  return options.find((option) => option.railtype.label === line.label)?.name ?? line.label ?? '';
}

export interface MaintenanceFigures {
  /** the selectable railtypes, named for this language */
  options: NamedRailtype[];
  result: NetworkMaintenance;
}

/** What the network costs to own for a year, on the counts entered. */
export function useMaintenance(): MaintenanceFigures {
  const { game, calc } = useSettingsStore();
  const network = useRouteStore((s) => s.network);
  // named through railtypeOptions: a set may call two tracks the same thing, and a column of
  // identical labels would be two fields nobody can tell apart. Not memoised — the names are
  // translated, and a memo would hold the language they were first drawn in
  const options = railtypeOptions(selectableRailtypes(game));
  const railtypes = options.map((option) => option.railtype);

  return { options, result: networkMaintenance(networkCounts(network), railtypes, game, calc.priceYear) };
}

export interface CorridorFigures {
  /** what the corridor could be converted to, named for this language */
  options: NamedRailtype[];
  target: Railtype | null;
  /** the target track as this language names it; empty when none is chosen */
  targetName: string;
  /** engines the target track could be worked with */
  candidates: Train[];
  replacement: Train | null;
  result: CorridorUpgradeResult | null;
}

/** Does converting the corridor pay for itself? Null until there is a trip and a target. */
export function useCorridor(route: RouteWithFlowParams | null): CorridorFigures {
  const { game, calc } = useSettingsStore();
  const corridor = useRouteStore((s) => s.corridor);
  const network = useRouteStore((s) => s.network);

  const from = activeRailtype(game, calc.trackType);
  const options = railtypeOptions(selectableRailtypes(game)).filter(
    (option) => option.railtype.label !== from.label,
  );
  const chosen = options.find((option) => option.railtype.label === corridor.target) ?? null;
  const target = chosen?.railtype ?? null;

  // the same buy menu every other list of vehicles reads, sold ids included: an imported game
  // has already answered which machines exist in it, and that answer beats the formula
  // (engine/availability.ts)
  const soldIds = useSoldIds(calc.priceYear, game);
  const buyMenu = useMemo(() => availabilityContext(game, soldIds), [game, soldIds]);
  const candidates = useMemo(
    () => (target ? replacementCandidates(activeTrains(game), target, game, calc, buyMenu) : []),
    [target, game, calc, buyMenu],
  );
  const replacement = candidates.find((train) => train.id === corridor.engineId) ?? null;

  const result = useMemo(() => {
    if (!route || !target) return null;
    return corridorUpgrade(route, {
      target,
      pieces: corridor.pieces,
      trains: corridor.trains,
      replacement,
      network: networkCounts(network),
    });
  }, [route, target, replacement, corridor.pieces, corridor.trains, network]);

  return { options, target, targetName: chosen?.name ?? '', candidates, replacement, result };
}

/** How many signals the line is worth, and what the extra ones cost. */
export function useSignals(route: RouteWithFlowParams | null): SignalDensityResult | null {
  const network = useRouteStore((s) => s.network);
  const descentLevels = useRouteStore((s) => s.signals.descentLevels);

  const inputs = useMemo(
    () => (route ? signalInputs(route, networkCounts(network), descentLevels) : null),
    [route, network, descentLevels],
  );

  // settings come off the route, not off the store: the route already carries the game and
  // the assumptions the trip was stated with, and reading a second copy is how the two would
  // start disagreeing (corridorUpgrade.ts does the same)
  return useMemo(() => (inputs && route ? signalPlan(inputs, route) : null), [inputs, route]);
}
