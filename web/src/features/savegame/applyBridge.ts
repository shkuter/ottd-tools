/**
 * Taking a bridge: what the stores end up holding once a card of the game tab hands its
 * values to a calculating tab.
 *
 * Kept apart from `bridge.ts` — that one decides, this one writes — so the deciding stays a
 * pure function of the snapshot while the writing can be tested by reading the stores back.
 * Stores are reached through `getState()` rather than hooks: a click handler is not a render.
 */

import { activeEntries } from '../../dataset';
import type { GameSettings } from '../../engine/settings';
import { useConsistStore } from '../../state/consistStore';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useRouteStore } from '../../state/routeStore';
import type { OptimizerPrefill } from '../../state/optimizerStore';
import { incomePrefillValues, type IncomeBridge } from './bridge';

/**
 * Route income: the consist goes to its own store, the trip to the route store. A partial
 * bridge writes the consist and the cargo only — every other input stays whatever the user
 * last worked with, because the route said nothing about it.
 */
export function applyIncomeBridge(bridge: IncomeBridge, label: string): void {
  const consist = useConsistStore.getState();
  const route = useRouteStore.getState();

  consist.setEntries(bridge.entries);
  consist.setCargoLabel(bridge.cargo.label);
  route.setCargoLabel(bridge.cargo.label);

  if (bridge.trip !== null) {
    route.setDistanceTiles(bridge.trip.distanceTiles);
    route.setAmount(bridge.trip.amount);
    route.setProductionPerMonth(bridge.trip.productionPerMonth);
    route.setWaitForFullLoad(bridge.trip.waitForFullLoad);
    // the consist that just arrived times the trip, not a figure left from an earlier one
    route.setManualDays(null);
  }
  route.setPrefillOrigin({ source: 'route', label, values: incomePrefillValues(bridge) });
}

/** Best train: whatever of cargo, leg and flow the bridge could state. */
export function applyOptimizerBridge(
  values: Partial<OptimizerPrefill>,
  origin: { source: 'route' | 'industry'; label: string },
): void {
  const optimizer = useOptimizerStore.getState();
  if (values.cargoLabel !== undefined) optimizer.setCargoLabel(values.cargoLabel);
  if (values.distanceTiles !== undefined) optimizer.setDistanceTiles(values.distanceTiles);
  if (values.productionPerMonth !== undefined) {
    optimizer.setProductionPerMonth(values.productionPerMonth);
  }
  optimizer.setPrefillOrigin({ ...origin, values });
}

/**
 * What the Route income tab currently holds, in the shape the note compares against — the
 * consist as the tab itself computes with, so a note cannot stand over figures the tab is
 * not using (a vehicle of another set is left out of both).
 */
export function routePrefillState(game: GameSettings) {
  const route = useRouteStore.getState();
  return {
    cargoLabel: route.cargoLabel,
    distanceTiles: route.distanceTiles,
    amount: route.amount,
    manualDays: route.manualDays,
    productionPerMonth: route.productionPerMonth,
    waitForFullLoad: route.waitForFullLoad,
    consist: activeEntries(useConsistStore.getState().entries, game).map((entry) => ({
      id: entry.train.id,
      count: entry.count,
    })),
  };
}
