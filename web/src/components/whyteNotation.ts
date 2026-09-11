/**
 * The axle arrangement Iron Horse writes into a steam engine's name — "0-8-4 Abernant",
 * "2-6-0+0-6-2 Cardiff" — read out in words. Kept apart from the component because the
 * notation is a fact about the name, not about any one list that shows it.
 *
 * Whyte notation counts **wheels**, not axles: 0-8-4 is eight driving wheels, which is four
 * driving axles. The hint names both, since the wheel count is what the name says and the
 * axle count is what the player compares engines by.
 */

import { t } from '../i18n';
import type { Locale } from '../state/localeStore';

/** One engine unit: what runs in front, what drives, what runs behind. */
export interface WhyteUnit {
  leadingWheels: number;
  /** Driving groups, front to back. More than one (0-4-4-0) means separate sets of drivers. */
  drivingWheels: number[];
  trailingWheels: number;
}

export interface WhyteNotation {
  /** The formula exactly as it stands in the name. */
  formula: string;
  /** One entry per engine unit; more than one means an articulated locomotive. */
  units: WhyteUnit[];
}

/**
 * The formula anywhere in the name, not only at its start: the one vanilla steam engine is
 * called "Wills 2-8-0", and anchoring the search would drop it without a word.
 *
 * What the groups mean beyond their wheels is not ours to say: "0-6-0+0-6-0" is two pannier
 * tanks coupled (Iron Horse's Xerxes, built with repeat=2), while "0-4-0+0-4-0" is a Garratt
 * (its Pika). Both have more than one running unit, and that is as far as the name goes.
 *
 * Three numbers is the shortest real arrangement (leading, driving, trailing); a bare pair
 * would match years and gauges that have nothing to do with wheels.
 */
const FORMULA = /\b\d+(?:-\d+){2,}(?:\+\d+(?:-\d+){2,})*\b/;

export function parseWhyteNotation(name: string): WhyteNotation | null {
  const match = FORMULA.exec(name);
  if (!match) return null;
  const formula = match[0];
  const units = formula.split('+').map((unit) => {
    const wheels = unit.split('-').map(Number);
    return {
      leadingWheels: wheels[0]!,
      drivingWheels: wheels.slice(1, -1),
      trailingWheels: wheels[wheels.length - 1]!,
    };
  });
  return { formula, units };
}

/**
 * Wheels with the axles they amount to: "8 (4 axles)". An odd count has no whole number of
 * axles to name — no arrangement in either set has one, and a made-up "1.5 axles" would be
 * worse than saying nothing — so it comes back as the bare count.
 */
function wheels(count: number, locale: Locale): string {
  const axles = count / 2;
  if (!Number.isInteger(axles)) return String(count);
  return `${count} (${t(axles === 1 ? 'whyte.axle' : 'whyte.axles', { count: axles }, locale)})`;
}

/**
 * The hint, one line per statement: the tooltip lays them out as lines, and a single string
 * with newlines in it would come out as one run of prose. The locale is passed in rather than
 * read off the store because every caller sits inside a memoised list column, and a hint
 * built without it would freeze in the language it was first rendered in.
 */
export function whyteNotationLines(notation: WhyteNotation, locale: Locale): string[] {
  const lines = [t('whyte.title', { formula: notation.formula }, locale)];
  const articulated = notation.units.length > 1;
  if (articulated) lines.push(t('whyte.articulated', undefined, locale));
  notation.units.forEach((unit, i) => {
    // an articulated engine gets its units marked off: a flat list of six groups would not
    // say where one running unit ends and the next begins
    if (articulated) lines.push(t('whyte.unit', { n: i + 1 }, locale));
    // a group of no wheels is named without being explained: the reader still sees the zero
    // of the formula accounted for, and "0 wheels guide the engine" is a sentence about
    // something that is not there
    lines.push(
      unit.leadingWheels > 0
        ? t('whyte.leading', { wheels: wheels(unit.leadingWheels, locale) }, locale)
        : t('whyte.leadingNone', undefined, locale),
    );
    const driving = unit.drivingWheels.map((group) => wheels(group, locale)).join(' + ');
    // two driving groups in a row read as one group of their sum unless said otherwise. How
    // the machine is built the formula does not settle — 0-4-4-0 is a Fairlie in Iron Horse's
    // Thor and a Mallet in its Alfama — so the hint speaks of the writing, not of the frame
    lines.push(
      t(unit.drivingWheels.length > 1 ? 'whyte.drivingSets' : 'whyte.driving', { wheels: driving }, locale),
    );
    lines.push(
      unit.trailingWheels > 0
        ? t('whyte.trailing', { wheels: wheels(unit.trailingWheels, locale) }, locale)
        : t('whyte.trailingNone', undefined, locale),
    );
  });
  return lines;
}
