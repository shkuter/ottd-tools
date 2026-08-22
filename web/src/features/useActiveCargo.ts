import { useEffect, useMemo } from 'react';
import type { Cargo } from '../types';

/**
 * Which cargo a tab computes with, given what it had chosen and what the active set holds.
 * A choice outside the set — the FIRS economy changed under it — gives way to the first
 * cargo of the new set; an empty set has nothing to offer and gives null.
 */
export function pickActiveCargo(cargos: readonly Cargo[], label: string): Cargo | null {
  return cargos.find((c) => c.label === label) ?? cargos[0] ?? null;
}

/**
 * `pickActiveCargo` as a hook, correcting the store as it goes so whatever else reads the
 * label — the consist carried to another tab, the payment rate — follows the same cargo.
 */
export function useActiveCargo(
  cargos: Cargo[],
  label: string,
  setLabel: (label: string) => void,
): Cargo | null {
  const cargo = useMemo(() => pickActiveCargo(cargos, label), [cargos, label]);
  useEffect(() => {
    if (cargo && cargo.label !== label) setLabel(cargo.label);
  }, [cargo, label, setLabel]);
  return cargo;
}
