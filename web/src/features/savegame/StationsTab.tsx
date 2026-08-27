import { useMemo, useState } from 'react';
import { Table } from '@mantine/core';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { sortRows, type SortState, type SortValues } from '../../components/table/sorting';
import { num, percent } from '../../components/format';
import { intlLocale, t, useLocale } from '../../i18n';
import { stationName } from '../../savegame/display';
import { cargoLookup, townsById } from './labels';
import { CargoLabel } from './CargoLabel';
import { GoodsCell } from './GoodsCell';
import type { Snapshot, SnapshotStation } from '../../savegame/snapshot';
import type { SnapshotSettings } from '../../savegame/snapshotStore';

type Column = 'name' | 'waiting' | 'rating';

/**
 * Stations of the company with what waits on them and how the game rates them. Fact only:
 * whether the calculator's rating model agrees is a question of its own, and this list does
 * not answer it.
 */
export function StationsTab({
  snapshot,
  settings,
  companyId,
}: {
  snapshot: Snapshot;
  settings: SnapshotSettings;
  companyId: number;
}) {
  const locale = useLocale();
  const [sort, setSort] = useState<SortState<Column>>(null);
  const cargoOf = useMemo(() => cargoLookup(settings.game), [settings.game]);

  const towns = useMemo(() => townsById(snapshot.towns), [snapshot]);
  const rows = useMemo(
    // waypoints are not stations: nothing waits on them and the game rates nothing there
    () => snapshot.stations.filter((s) => !s.isWaypoint && s.companyId === companyId),
    [snapshot.stations, companyId],
  );

  // not memoised: the values are names in the current language (see RoutesTab)
  const values: SortValues<SnapshotStation, Column> = {
    name: (station) => stationName(station, towns),
    waiting: (station) => station.goods.reduce((sum, goods) => sum + goods.waiting, 0),
    // a station the game shows no rating for has none, and rows without a value sort last
    rating: (station) => {
      const rated = station.goods.filter((goods) => goods.rating !== null);
      if (rated.length === 0) return null;
      return rated.reduce((sum, goods) => sum + goods.rating!, 0) / rated.length;
    },
  };
  const shown = sortRows(rows, sort, values, new Intl.Collator(intlLocale(locale)));

  return (
    <TableFrame rowCount={shown.length} emptyMessage={t('game.noStations')}>
      <Table.Thead>
        <Table.Tr>
          <SortableTh column="name" sort={sort} onSort={setSort}>
            {t('game.station')}
          </SortableTh>
          <SortableTh column="waiting" sort={sort} onSort={setSort}>
            {t('game.waiting')}
          </SortableTh>
          <SortableTh column="rating" sort={sort} onSort={setSort} className="cell-num">
            {t('game.rating')}
          </SortableTh>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((station) => (
          <Table.Tr key={station.id}>
            <Table.Td>{stationName(station, towns)}</Table.Td>
            <Table.Td>
              <GoodsCell entries={station.goods}>
                {(goods) => <CargoLabel cargo={cargoOf(goods.label)} after={num(goods.waiting)} />}
              </GoodsCell>
            </Table.Td>
            <Table.Td className="cell-num">
              {/* the cargo is named once, in the column before this one: both cells walk the
                  same list, so their rows line up. The game rates a cargo only once it has
                  handled one, and where it shows nothing this stays blank rather than
                  explaining itself on every row */}
              <GoodsCell entries={station.goods}>
                {/* a blank line, not an empty one: an entry of no height would let the
                    ratings slide up past the cargoes they belong to */}
                {(goods) => (goods.rating === null ? '\u00a0' : percent(goods.rating / 255))}
              </GoodsCell>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </TableFrame>
  );
}
