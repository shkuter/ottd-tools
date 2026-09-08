/**
 * The comparison state of the search tab: what is ticked, whether the panel is open and what it
 * shows. The ticks live here alone — a tick computes nothing, and a persisted store field is
 * required to change a calculation, which this does not.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Train, TrainsMeta } from '../../types';
import type { OptimizeParams, OptimizeResult } from '../../engine/optimize';
import type { OptimizerCache } from '../../engine/optimizeCache';
import {
  MAX_COMPARED,
  comparisonColumns,
  comparisonMetrics,
  pickOf,
  samePick,
  sharedWagon,
  type ComparisonColumn,
  type ComparisonMetric,
  type ComparisonPick,
} from './comparison';

/**
 * The task an answer answers, as one string: everything the search depends on except the goal —
 * the goal rebuilds the rows, but the question stays the same, so ticks survive it.
 *
 * A key rather than a dependency list beside the search's own: two lists drift apart the moment
 * an input is added, which is how `soldIds` was lost once already — so everything is read off
 * the search parameters themselves. `soldIds` is a Set, so it goes in as a sorted list;
 * `JSON.stringify` would fold it into an empty object.
 */
export function taskKeyOf(params: OptimizeParams | null): string {
  const soldIds = params?.soldIds ?? null;
  return JSON.stringify({
    ...params,
    cargo: params?.cargo.label ?? null,
    goal: null,
    soldIds: soldIds ? [...soldIds].sort() : null,
  });
}

export interface Comparison {
  columns: ComparisonColumn[];
  metrics: ComparisonMetric[];
  wagon: Train;
}

export interface ComparisonState {
  /** How many rows are ticked: the bar says it, and the caller needs no more than that. */
  pickedCount: number;
  /** Whether this row is ticked. */
  isPicked: (row: OptimizeResult) => boolean;
  /** Whether another row can still be ticked — the limit belongs to the panel. */
  canPickMore: boolean;
  toggle: (row: OptimizeResult) => void;
  clear: () => void;
  /** Open the panel. Available from two ticks: one engine has nothing to be compared with. */
  compare: () => void;
  canCompare: boolean;
  /** The panel's data while it is open; null when it is closed or there is nothing to show. */
  comparison: Comparison | null;
  close: () => void;
}

export function useComparison({
  rows,
  trains,
  params,
  meta,
  cache,
  taskKey,
}: {
  rows: readonly OptimizeResult[];
  trains: readonly Train[];
  /** Parameters of the very search that produced `rows`: a comparison is computed with them. */
  params: OptimizeParams | null;
  meta: TrainsMeta;
  cache?: OptimizerCache;
  /** The task the answer answers: once it changes, there is nothing left to have ticked. */
  taskKey: string;
}): ComparisonState {
  const [picks, setPicks] = useState<ComparisonPick[]>([]);
  const [comparing, setComparing] = useState(false);

  // A new task rebuilds the answer, and the ticked engines may not be in it. The goal is not
  // part of the key: it rebuilds the rows, but the question is the same one, so ticks survive.
  useEffect(() => {
    setPicks([]);
    setComparing(false);
  }, [taskKey]);

  const toggle = (row: OptimizeResult) => {
    const pick = pickOf(row);
    setPicks((prev) => {
      const without = prev.filter((p) => !samePick(p, pick));
      if (without.length !== prev.length) {
        // Fewer than two ticks left: there is nothing to compare, and the panel closes itself —
        // otherwise it would reappear on its own the moment a second row is ticked again.
        if (without.length < 2) setComparing(false);
        return without;
      }
      return prev.length >= MAX_COMPARED ? prev : [...prev, pick];
    });
  };

  const comparison = useMemo(() => {
    if (!comparing || picks.length < 2 || !params) return null;
    const { wagon, columns } = comparisonColumns(picks, rows, trains, params, meta, cache);
    if (!wagon) return null;
    return {
      columns,
      wagon,
      metrics: comparisonMetrics(columns, {
        productionPerMonth: params.productionPerMonth ?? 0,
        supplyTarget: params.supplyTarget ?? null,
      }),
    };
  }, [comparing, picks, rows, trains, params, meta, cache]);

  return {
    pickedCount: picks.length,
    isPicked: (row) => picks.some((p) => samePick(p, pickOf(row))),
    canPickMore: picks.length < MAX_COMPARED,
    toggle,
    clear: () => {
      setPicks([]);
      setComparing(false);
    },
    compare: () => setComparing(true),
    // Отметок мало — или ни одна из них не пережила пересборку строк, и уравнивать условия
    // не по чему: команда тогда ничего бы не сделала, и гасить её честнее.
    canCompare: picks.length >= 2 && sharedWagon(picks, rows) !== null,
    comparison,
    close: () => setComparing(false),
  };
}
