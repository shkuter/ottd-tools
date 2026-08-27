import { useMemo, useState } from 'react';
import { Group, Select, Table } from '@mantine/core';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { sortRows, type SortState, type SortValues } from '../../components/table/sorting';
import { num } from '../../components/format';
import { Money } from '../../components/Money';
import { intlLocale, t, useLocale } from '../../i18n';
import type { Snapshot, SnapshotTrain } from '../../savegame/snapshot';
import type { SnapshotSettings } from '../../savegame/snapshotStore';
import { groupOptions, groupWithDescendants } from './game';
import { cargoLookup, cargoNamer, consistText, trainLabel } from './labels';
import { CargoLabel } from './CargoLabel';
import { GoodsCell } from './GoodsCell';
import { fieldWidth } from '../../skin';

type Column = 'name' | 'consist' | 'cargo' | 'thisYear' | 'lastYear' | 'built';

/** Every train of the company, filtered by group the way the game's train list is. */
export function TrainsTab({
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
  // groups belong to a company, so the filter cannot outlive a switch to another one:
  // it would leave the list empty under a group this company does not have
  const [group, setGroup] = useState<{ companyId: number; id: string | null }>({
    companyId,
    id: null,
  });
  const groupId = group.companyId === companyId ? group.id : null;
  const setGroupId = (id: string | null) => setGroup({ companyId, id });

  const groups = useMemo(
    () => groupOptions(snapshot.groups, companyId),
    [snapshot.groups, companyId],
  );
  const cargoLabel = useMemo(() => cargoNamer(settings.game), [settings.game]);
  const cargoOf = useMemo(() => cargoLookup(settings.game), [settings.game]);
  const carried = (train: SnapshotTrain) => train.cargo.filter((load) => load.capacity > 0);

  const rows = useMemo(() => {
    const wanted = groupId === null ? null : groupWithDescendants(snapshot.groups, Number(groupId));
    return snapshot.trains.filter(
      (train) =>
        train.companyId === companyId &&
        (wanted === null || (train.groupId !== null && wanted.has(train.groupId))),
    );
  }, [snapshot.trains, snapshot.groups, companyId, groupId]);

  // what the cell lists, as one string — the column sorts by text, and it has to be the
  // text of the same cargoes the cell shows
  const cargoText = (train: SnapshotTrain): string =>
    carried(train)
      .map((load) => `${cargoLabel(load.label)} ${num(load.loaded)}/${num(load.capacity)}`)
      .join(', ') || '—';

  // not memoised: the values are names in the current language (see RoutesTab)
  const values: SortValues<SnapshotTrain, Column> = {
    name: (train) => trainLabel(train),
    consist: (train) => consistText(train.consist),
    cargo: (train) => cargoText(train),
    thisYear: (train) => train.profitThisYear,
    lastYear: (train) => train.profitLastYear,
    built: (train) => train.buildYear,
  };
  const shown = sortRows(rows, sort, values, new Intl.Collator(intlLocale(locale)));

  return (
    <>
      <Group className="filters">
        <Select
          {...fieldWidth('wide')}
          label={t('game.group')}
          data={[
            { value: '', label: t('game.allGroups') },
            ...groups.map((group) => ({
              value: String(group.id),
              // depth is shown with spaces, as the game indents its own group pane
              label: `${' '.repeat(group.depth * 2)}${group.label}`,
            })),
          ]}
          value={groupId ?? ''}
          onChange={(value) => setGroupId(value === '' ? null : value)}
          allowDeselect={false}
        />
      </Group>
      <TableFrame pinEdges rowCount={shown.length} emptyMessage={t('game.noTrains')}>
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="name" sort={sort} onSort={setSort}>
              {t('game.train')}
            </SortableTh>
            <SortableTh column="consist" sort={sort} onSort={setSort}>
              {t('game.consist')}
            </SortableTh>
            <SortableTh column="cargo" sort={sort} onSort={setSort}>
              {t('game.cargo')}
            </SortableTh>
            <SortableTh column="lastYear" sort={sort} onSort={setSort} className="cell-money">
              {t('game.lastYear')}
            </SortableTh>
            <SortableTh column="thisYear" sort={sort} onSort={setSort} className="cell-money">
              {t('game.thisYear')}
            </SortableTh>
            <SortableTh column="built" sort={sort} onSort={setSort} className="cell-num">
              {t('game.built')}
            </SortableTh>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((train) => (
            <Table.Tr key={train.id}>
              <Table.Td>
                {trainLabel(train)}
                {train.stopped && <span className="hint"> · {t('game.stopped')}</span>}
              </Table.Td>
              <Table.Td>{consistText(train.consist)}</Table.Td>
              <Table.Td>
                <GoodsCell entries={carried(train)}>
                  {(load) => (
                    <CargoLabel
                      cargo={cargoOf(load.label)}
                      after={`${num(load.loaded)}/${num(load.capacity)}`}
                    />
                  )}
                </GoodsCell>
              </Table.Td>
              <Table.Td className="cell-money">
                <Money value={train.profitLastYear} />
              </Table.Td>
              <Table.Td className="cell-money">
                <Money value={train.profitThisYear} />
              </Table.Td>
              <Table.Td className="cell-num">{train.buildYear}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </TableFrame>
    </>
  );
}
