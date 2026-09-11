/**
 * A consist of the imported game, written the way `consistText()` writes it but as markup, so
 * every vehicle in it can explain the axle arrangement in its own name. Where only a string
 * fits — the browser's own tooltip, the value a column sorts by — that function is still the
 * one to call.
 */

import { VehicleName } from '../../components/VehicleName';
import { CONSIST_JOINER, consistParts, consistText } from './labels';
import type { SnapshotConsistEntry } from '../../savegame/snapshot';

export function ConsistLine({ consist }: { consist: readonly SnapshotConsistEntry[] }) {
  const parts = consistParts(consist);
  // an empty consist is named, not drawn, and the string form is where that name lives
  if (parts.length === 0) return <>{consistText(consist)}</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? CONSIST_JOINER : ''}
          {part.train ? <VehicleName train={part.train} label={part.text} /> : part.text}
        </span>
      ))}
    </>
  );
}
