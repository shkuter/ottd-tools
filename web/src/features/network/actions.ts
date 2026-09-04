import { t } from '../../i18n';
import { num } from '../../components/format';
import type { CorridorUpgradeResult } from '../../engine/corridorUpgrade';
import type { MaintenanceLine, NetworkMaintenance } from '../../engine/infrastructure';
import type { SignalDensityResult } from '../../engine/signals';
import type { NetworkPanel } from './panels';

/** Which panel an action belongs to — every panel but the upkeep one answers with actions. */
export type NetworkActionKind = Exclude<NetworkPanel, 'maintenance'>;

/** One way to spend less on the network per year. */
export interface NetworkAction {
  /** the panel that answered it; the view turns it into a link (panels.ts) */
  panel: NetworkActionKind;
  /** what to do, in the words of the panel that answered it */
  label: string;
  /** money the action saves per year, always positive */
  yearly: number;
  /** what that is as a share of the yearly upkeep; 0 when the game charges no upkeep */
  share: number;
}

/** The costliest billed line, and what share of the year it takes. */
export interface CostliestLine {
  line: MaintenanceLine;
  share: number;
}

function share(amount: number, total: number): number {
  return total > 0 ? amount / total : 0;
}

/**
 * What to trim, in the order worth trimming it.
 *
 * The summary computes nothing of its own: every figure here is what a panel below already
 * answered, and the ranking is the only thing added. An action makes the list when its panel
 * has an answer at all and that answer is positive money — a conversion that loses money and
 * a line signalled too sparsely are explanations their own panels give, not things to do.
 */
export function networkActions(
  upkeep: NetworkMaintenance,
  corridor: CorridorUpgradeResult | null,
  signals: SignalDensityResult | null,
  /** how the corridor's target track is named in this language */
  targetName: string,
): NetworkAction[] {
  const actions: NetworkAction[] = [];

  // thinning below the useful spacing is not a saving but a loss of throughput, and the
  // signal panel says so itself
  if (signals && !signals.tooSparse && signals.yearlySaving > 0) {
    actions.push({
      panel: 'signals',
      label: t('networkPage.actionSignals', { count: num(signals.recommendedSignals) }),
      yearly: signals.yearlySaving,
      share: share(signals.yearlySaving, upkeep.yearly),
    });
  }

  if (corridor && corridor.yearlyDelta > 0) {
    actions.push({
      panel: 'corridor',
      label: t('networkPage.actionCorridor', { track: targetName }),
      yearly: corridor.yearlyDelta,
      share: share(corridor.yearlyDelta, upkeep.yearly),
    });
  }

  return actions.sort((a, b) => b.yearly - a.yearly);
}

/**
 * The line the year is mostly spent on. Null when nothing is owned: a costliest line of zero
 * would read as an answer, and there is none to give yet.
 */
export function costliestLine(upkeep: NetworkMaintenance): CostliestLine | null {
  const line = upkeep.lines.reduce<MaintenanceLine | null>(
    (worst, candidate) => (worst === null || candidate.yearly > worst.yearly ? candidate : worst),
    null,
  );
  if (line === null || line.yearly <= 0) return null;
  return { line, share: share(line.yearly, upkeep.yearly) };
}
