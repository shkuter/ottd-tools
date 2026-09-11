/**
 * A vehicle's name wherever a list shows it, with the axle arrangement in its name explained
 * on hover (`whyteNotation.ts`).
 *
 * One component for every list, because the explanation is one: the catalogue, the search,
 * the supply tab and the imported game must not read differently. A vehicle whose name
 * carries no arrangement — every diesel, every electric, all but one vanilla engine — renders
 * exactly as it did before, so the markup of a list does not change from row to row.
 */

import { Tooltip } from '@mantine/core';
import { useLocale } from '../i18n';
import { parseWhyteNotation, whyteNotationLines } from './whyteNotation';

export function VehicleName({
  train,
  label,
}: {
  /** The vehicle: the arrangement is read off its own name, never off the label. */
  train: { name: string };
  /**
   * How this list writes the vehicle — `engineLabel()` puts the section count in front
   * ("2× Haar"). Defaults to the bare name.
   */
  label?: string;
}) {
  const locale = useLocale();
  const text = label ?? train.name;
  const notation = parseWhyteNotation(train.name);
  if (!notation) return <>{text}</>;
  return (
    <Tooltip
      label={whyteNotationLines(notation, locale).map((line, i) => (
        // by position: an articulated engine repeats a line word for word in each unit
        <div key={i}>{line}</div>
      ))}
      multiline
      w={320}
    >
      {/* a span of its own: the tooltip needs a child it can hold a ref to */}
      <span>{text}</span>
    </Tooltip>
  );
}
