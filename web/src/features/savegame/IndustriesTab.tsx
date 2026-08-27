import { useMemo, useState } from 'react';
import { Table } from '@mantine/core';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { sortRows, type SortState, type SortValues } from '../../components/table/sorting';
import { num, percent } from '../../components/format';
import { intlLocale, t, useLocale } from '../../i18n';
import { industryName } from '../../i18n/names';
import { industryById } from '../../dataset';
import { vanillaIndustryById } from '../../vanilla';
import { townName } from '../../savegame/display';
import { cargoLookup, townsById } from './labels';
import { industryToOptimizer } from './bridge';
import { CargoBridgeLink } from './CargoBridgeLink';
import { GoodsCell } from './GoodsCell';
import type { Snapshot, SnapshotIndustry } from '../../savegame/snapshot';
import type { SnapshotSettings } from '../../savegame/snapshotStore';

type Column = 'name' | 'town' | 'produced' | 'transported';

/**
 * Industries of the game with what they made last month and how much of it was hauled away.
 * Industries belong to no company, so this list ignores the company picker.
 */
export function IndustriesTab({
  snapshot,
  settings,
}: {
  snapshot: Snapshot;
  settings: SnapshotSettings;
}) {
  const locale = useLocale();
  const [sort, setSort] = useState<SortState<Column>>(null);

  const towns = useMemo(() => townsById(snapshot.towns), [snapshot]);
  const cargoOf = useMemo(() => cargoLookup(settings.game), [settings.game]);

  // FIRS names most of them; a game played without it names them through the base game's
  // own strings, which is where the ids of the vanilla set come from
  const typeName = (industry: SnapshotIndustry): string => {
    const id = industry.catalogueId;
    if (id === null) return t('game.unknownIndustry');
    const known = industryById.get(id) ?? vanillaIndustryById.get(id);
    return known ? industryName(known) : t('game.unknownIndustry');
  };
  const placeName = (industry: SnapshotIndustry): string => {
    const town = industry.townId === null ? undefined : towns.get(industry.townId);
    return town ? townName(town) : '—';
  };
  /** How the row itself names this industry: its type, and the town that tells two apart. */
  const industryLabel = (industry: SnapshotIndustry): string => {
    const place = placeName(industry);
    return place === '—' ? typeName(industry) : `${typeName(industry)} (${place})`;
  };
  const totals = (industry: SnapshotIndustry) => {
    let produced = 0;
    let transported = 0;
    for (const entry of industry.produced) {
      produced += entry.lastMonthProduction ?? 0;
      transported += entry.lastMonthTransported ?? 0;
    }
    return { produced, transported };
  };

  // not memoised: the values are names in the current language (see RoutesTab)
  const values: SortValues<SnapshotIndustry, Column> = {
    name: (industry) => typeName(industry),
    town: (industry) => placeName(industry),
    produced: (industry) => totals(industry).produced,
    transported: (industry) => totals(industry).transported,
  };
  const shown = sortRows(snapshot.industries, sort, values, new Intl.Collator(intlLocale(locale)));

  return (
    <TableFrame rowCount={shown.length} emptyMessage={t('game.noIndustries')}>
      <Table.Thead>
        <Table.Tr>
          <SortableTh column="name" sort={sort} onSort={setSort}>
            {t('game.industry')}
          </SortableTh>
          <SortableTh column="town" sort={sort} onSort={setSort}>
            {t('game.town')}
          </SortableTh>
          <SortableTh column="produced" sort={sort} onSort={setSort}>
            {t('game.produced')}
          </SortableTh>
          <SortableTh column="transported" sort={sort} onSort={setSort} className="cell-num">
            {t('game.transported')}
          </SortableTh>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((industry) => (
          <Table.Tr key={industry.id}>
            <Table.Td>{typeName(industry)}</Table.Td>
            <Table.Td>{placeName(industry)}</Table.Td>
            <Table.Td>
              {/* the bridge belongs to this column only: GoodsCell also renders the
                  transported one, and a link drawn inside it would appear in both */}
              <GoodsCell entries={stated(industry)}>
                {(entry) => (
                  <CargoBridgeLink
                    cargo={cargoOf(entry.label)}
                    after={num(entry.lastMonthProduction)}
                    values={industryToOptimizer(entry).values}
                    source="industry"
                    label={industryLabel(industry)}
                  />
                )}
              </GoodsCell>
            </Table.Td>
            <Table.Td className="cell-num">
              {/* how much of what was made actually left — the share the game's own industry
                  window shows */}
              <GoodsCell entries={stated(industry)}>
                {(entry) => (
                  <>
                    {num(entry.lastMonthTransported)}
                    {entry.lastMonthProduction > 0 && (
                      <span> ({percent(entry.lastMonthTransported / entry.lastMonthProduction)})</span>
                    )}
                  </>
                )}
              </GoodsCell>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </TableFrame>
  );
}

/** One produced cargo whose last month the savegame stated — both figures are there. */
type StatedMonth = SnapshotIndustry['produced'][number] & {
  lastMonthProduction: number;
  lastMonthTransported: number;
};

/** Cargoes whose last month the savegame actually stated; the rest have nothing to show. */
function stated(industry: SnapshotIndustry): StatedMonth[] {
  return industry.produced.filter(
    (entry): entry is StatedMonth =>
      entry.lastMonthProduction !== null && entry.lastMonthTransported !== null,
  );
}
