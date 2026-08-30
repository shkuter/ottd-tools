/**
 * The mark on a vehicle that may not stand in the buy menu of the chosen year: it has either
 * not gone on sale yet or been withdrawn already (`engine/availability.ts`).
 *
 * One component for every list, because the answer is one: the catalogue, the search and the
 * supply tab must not mark the same vehicle differently. The title names the dates where the
 * doubt is about the introduction — the answer carries them — and explains the rule where it
 * is about the withdrawal, which has no date to name.
 */

import { intlLocale, useLocale } from '../i18n';
import { buyMenuNoteTitle } from './buyMenuTitle';
import type { VehicleAvailability } from '../engine/availability';

export function BuyMenuNote({ availability }: { availability: VehicleAvailability }) {
  const locale = useLocale();
  if (availability.state !== 'uncertain') return null;
  return (
    <sup className="intro-warn" title={buyMenuNoteTitle(availability, intlLocale(locale))}>
      ?
    </sup>
  );
}
