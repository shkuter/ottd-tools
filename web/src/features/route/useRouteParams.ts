import { useMemo } from 'react';
import { activeCargos, activeEntries, activeTrainsMeta, economyIdForPayment } from '../../dataset';
import { useLocale } from '../../i18n';
import { sortCargos } from '../../i18n/names';
import { cargoPaymentRate } from '../../engine/income';
import type { RouteWithFlowParams } from '../../engine/trip';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import type { Cargo, ConsistEntry } from '../../types';
import { useActiveCargo } from '../useActiveCargo';

/** The trip a tab computes with, and the pieces it is assembled from. */
export interface RouteInputs {
  /** cargoes of the active set, in the order the language sorts them */
  cargoList: Cargo[];
  /** the chosen one, or null when the set holds nothing */
  cargo: Cargo | null;
  /** the consist, filtered down to what the active set could actually buy */
  entries: ConsistEntry[];
  /** payment rate of the chosen cargo under the active economy */
  payment: number;
  /** null until there is both a cargo and a consist to state a trip with */
  routeParams: RouteWithFlowParams | null;
}

/**
 * One assembly of the trip for every tab that states it. The route income tab enters it and
 * the network tab reads it: two copies of this would drift apart on the first edit, and with
 * them the figures the corridor and signal panels are required to keep equal to the income
 * panel's.
 *
 * Calling it twice is safe. The only write it makes is `useActiveCargo` correcting a cargo
 * that fell out of the set, and that write is idempotent — the second caller finds nothing to
 * correct.
 */
export function useRouteParams(): RouteInputs {
  const route = useRouteStore();
  const consist = useConsistStore();
  const { game, calc } = useSettingsStore();
  const locale = useLocale();

  const cargoList = useMemo(() => sortCargos(activeCargos(game), locale), [game, locale]);
  const cargo = useActiveCargo(cargoList, route.cargoLabel, route.setCargoLabel);

  /*
   * Only what the current game could actually buy. A consist survives a change of vehicle set
   * in localStorage, and pricing a vanilla wagon with Iron Horse's basecost shifts (or the
   * other way round) states money no game charges.
   */
  const entries = useMemo(() => activeEntries(consist.entries, game), [consist.entries, game]);

  const payment = cargo ? cargoPaymentRate(cargo, economyIdForPayment(game), game, calc) : 0;

  // Round-trip economics of the consist built on the Consist tab — the same model the
  // optimizer uses, so a consist carried over with "→" shows the same figures here. The
  // optimizer picks the loading branch by its goal; this tab has no goal, so the branch is
  // the user's to set, and with it the source output the waiting branch accumulates from.
  const routeParams = useMemo(() => {
    if (entries.length === 0 || !cargo) return null;
    return {
      entries,
      cargo,
      payment,
      distanceTiles: route.distanceTiles,
      meta: activeTrainsMeta(game),
      game,
      calc,
      loadedDaysOverride: route.manualDays,
      productionPerMonth: route.productionPerMonth,
      waitForFullLoad: route.waitForFullLoad,
    };
  }, [
    entries, cargo, payment, route.distanceTiles, route.manualDays,
    route.productionPerMonth, route.waitForFullLoad, game, calc,
  ]);

  return { cargoList, cargo, entries, payment, routeParams };
}
