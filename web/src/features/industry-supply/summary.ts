/**
 * What the summary block says, as data rather than as branches inside the markup.
 *
 * The receiving industry's rule decides most of it, and that rule was already read once in the
 * engine; spreading the same three-way choice across the JSX made the tab's answer something
 * you had to reconstruct from the render tree. Here it is one function, and it can be tested
 * without a DOM.
 */
import { t } from '../../i18n';
import { num } from '../../components/format';
import { consistLabel } from '../../components/format';
import { cargoName } from '../../i18n/names';
import type { IndustrySupply } from '../../engine/supply';
import type { InputRun } from './inputs';

/** How a line is shown: plain text, the warning box, or the quiet note at the bottom. */
export type SummaryTone = 'plain' | 'warning' | 'hint';

export interface SummaryLine {
  tone: SummaryTone;
  text: string;
}

export interface SummaryParams {
  summary: IndustrySupply<InputRun>;
  /** Fleet limit in force on the tab, quoted by the advice. */
  maxTrains: number;
  /** Supply window in engine days, for the pool line. */
  windowDays: number;
}

/** Cargo name of an input, falling back to its label when the economy has no such cargo. */
function inputCargoName(input: InputRun): string {
  return input.cargo ? cargoName(input.cargo) : input.cargoLabel;
}

export function summaryLines({ summary, maxTrains, windowDays }: SummaryParams): SummaryLine[] {
  const routed = summary.states.some((state) => state !== 'unset');
  // Nothing routed means nothing was computed: a conversion of 0 % or a pool at base output
  // would read as an answer where there is none.
  if (!routed) return [{ tone: 'plain', text: t('supply.nothingRouted') }];

  const lines: SummaryLine[] = [];

  if (summary.rule === 'conversion') {
    lines.push({
      tone: 'plain',
      text: t('supply.conversion', { percent: num((summary.conversion ?? 0) * 100, 0) }),
    });
  } else if (summary.rule === 'pool') {
    // A pool with no volume at all is not a pool at base output: the routes given cannot be
    // run, and "0 delivered → 100 %" would read as a verdict.
    lines.push(
      summary.deliveredPerWindow === null
        ? { tone: 'plain', text: t('supply.poolUnserved') }
        : {
            tone: 'plain',
            text: t('supply.pool', {
              delivered: num(summary.deliveredPerWindow),
              window: num(windowDays, 1),
              percent: num(summary.pool?.productionPercent ?? 100),
            }),
          },
    );
  }

  if (summary.incomplete) lines.push({ tone: 'warning', text: t('supply.incomplete') });

  if (summary.bottleneck) {
    const { bottleneck } = summary;
    lines.push({
      tone: 'plain',
      text:
        bottleneck.kind === 'fleet'
          ? t('supply.bottleneckFleet', {
              cargo: inputCargoName(bottleneck.input),
              trains: String(bottleneck.trains),
              consist: bottleneck.input.leanest ? consistLabel(bottleneck.input.leanest) : '',
              limit: String(maxTrains),
            })
          : t('supply.bottleneckLimit', { cargo: inputCargoName(bottleneck.input) }),
    });
  } else if (summary.rule === 'conversion' && !summary.incomplete) {
    // No bottleneck has two reasons, and they are different news: every input is supplied, or
    // the ones that hold already reach the ceiling and the ones that missed cannot change it.
    lines.push({
      tone: 'plain',
      text: summary.states.every((state) => state !== 'misses')
        ? t('supply.noBottleneck')
        : t('supply.ceilingReached'),
    });
  }

  // The model gives every input its own fleet; a player hauling two cargos with one is doing
  // something this tab cannot see, and it says so rather than implying it.
  lines.push({ tone: 'hint', text: t('supply.sharedFleetNote') });
  return lines;
}
