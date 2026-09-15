/**
 * Tooltip text of a Best train row, kept out of the page so the words beside its numbers can be
 * checked without drawing the list: a count of days or trains agrees with its figure ("1 day",
 * "3 trains"), which a string with the noun written in cannot do.
 */
import { t } from '../../i18n';
import { countLabel, num } from '../../components/format';
import type { OptimizeResult } from '../../engine/optimize';

/**
 * Which loading branch the row won in, compared with what the branch that lost would have given.
 * Null where the branches do not differ: there the order changes nothing and saying so is noise.
 */
export function loadingBranchHint(row: OptimizeResult): string | null {
  if (!row.branchesDiffer || !row.otherBranch) return null;
  const other = {
    interval: countLabel('count.days', row.otherBranch.pickupIntervalDays, 1),
    cargo: num(row.otherBranch.cargoPerTrip),
  };
  return row.waitForFullLoad
    ? t('opt.branchWait', { days: countLabel('count.days', row.waitDays, 1), ...other })
    : t('opt.branchNoWait', other);
}

/**
 * The lines every supply rule states: the interval against the window, and the fleet that would
 * hold it. The window is FIRS's own (`supply_window_ticks` in the industry data, turned into days
 * by `supplyWindowDays`), so its unit is written in.
 */
export function supplyCommonHints(
  row: Pick<OptimizeResult, 'pickupIntervalDays'>,
  supply: { windowDays: number; trainsForWindow: number | null },
): string[] {
  return [
    t('opt.supplyHintInterval', {
      interval: countLabel('count.days', row.pickupIntervalDays, 1),
      window: countLabel('count.days', supply.windowDays, 1),
    }),
    t('opt.supplyHintFleet', { trains: countLabel('count.trains', supply.trainsForWindow ?? 1) }),
  ];
}
