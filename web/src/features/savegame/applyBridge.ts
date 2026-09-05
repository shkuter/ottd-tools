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
import {
  EMPTY_INPUT,
  inputKey,
  useIndustrySupplyStore,
  type InputRouteParams,
  type SupplyBridgeValues,
  type SupplyPrefill,
} from '../../state/industrySupplyStore';
import type { PrefillOrigin } from '../../state/prefill';
import { useRouteStore, type NetworkInputs, type RoutePrefill } from '../../state/routeStore';
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

/**
 * A cargo alone, from the chain graph: the income tab and the consist builder switch to it
 * and nothing else moves, as the partial route bridge does it.
 */
export function applyCargoIncomeBridge(values: Pick<RoutePrefill, 'cargoLabel'>, label: string): void {
  useConsistStore.getState().setCargoLabel(values.cargoLabel);
  const route = useRouteStore.getState();
  route.setCargoLabel(values.cargoLabel);
  route.setPrefillOrigin({ source: 'graph', label, values });
}

/**
 * Supply: the tab opens on the receiving industry, and the task's own input gets whatever
 * figures the bridge could state. Inputs the bridge said nothing about keep what the player
 * last entered — an industry's other inputs are not this task's business.
 */
export function applySupplyBridge(values: SupplyBridgeValues, label: string): void {
  const supply = useIndustrySupplyStore.getState();
  supply.setIndustryId(values.industryId);
  const key = inputKey(values.industryId, values.cargoLabel);
  const written: Partial<InputRouteParams> = {};
  if (values.distanceTiles !== undefined) written.distanceTiles = values.distanceTiles;
  if (values.productionPerMonth !== undefined) {
    written.productionPerMonth = values.productionPerMonth;
  }
  supply.setInput(key, written);
  supply.setPrefillOrigin({ source: 'chain', label, values });
}

/**
 * What the Supply tab currently holds in the shape the origin note compares — the one input a
 * chain task filled in. Lives beside the bridge that writes it, so the page does not have to
 * know how the two are matched up.
 */
export function supplyPrefillState(origin: PrefillOrigin<SupplyPrefill> | null): SupplyPrefill {
  const supply = useIndustrySupplyStore.getState();
  const cargoLabel = origin?.values.cargoLabel ?? '';
  const input = supply.inputs[inputKey(supply.industryId, cargoLabel)] ?? EMPTY_INPUT;
  return {
    industryId: supply.industryId,
    cargoLabel,
    distanceTiles: input.distanceTiles,
    productionPerMonth: input.productionPerMonth,
  };
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
 * Company network → Route income. Only the counts of the network: the company card states
 * nothing about a cargo, a leg or a consist, so the rest of the tab is left as the user
 * last worked with it.
 */
export function applyNetworkBridge(network: NetworkInputs, label: string): void {
  const route = useRouteStore.getState();
  route.setNetwork(network);
  // into the network's own note: a route carried over earlier still describes the cargo, the
  // leg and the consist, and none of them moved
  route.setNetworkOrigin({ source: 'company', label, values: { network } });
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
    network: route.network,
  };
}
