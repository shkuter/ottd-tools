/**
 * What the buy-menu mark says when hovered: the dates a vehicle is due between, or the rule
 * behind a withdrawal. Kept apart from the component because the search says the same thing
 * beside its checkboxes, and two copies of one sentence drift apart.
 */

import { t } from '../i18n';
import type { VehicleAvailability } from '../engine/availability';

/** Month and year as the interface writes a date. */
function monthYear(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function buyMenuNoteTitle(availability: VehicleAvailability, locale: string): string {
  if (availability.reason === 'retire') return t('vehicle.retireHint');
  const { intro } = availability;
  return [
    `${t('opt.introFrom')}: ${monthYear(intro.year, intro.month, locale)}`,
    intro.randomised
      ? `${t('opt.introLatest')}: ${monthYear(intro.latestYear, intro.latestMonth, locale)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}
