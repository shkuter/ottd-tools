import { useMemo, useState } from 'react';
import { Table, Tooltip } from '@mantine/core';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { sortRows, type SortState, type SortValues } from '../../components/table/sorting';
import { num } from '../../components/format';
import { Money } from '../../components/Money';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName } from '../../i18n/names';
import { stationName } from '../../savegame/display';
import type { Snapshot } from '../../savegame/snapshot';
import type { SnapshotSettings } from '../../savegame/snapshotStore';
import { routeRows, stationStops, type RouteRow } from './routeRows';
import { hasFinishedYear } from './game';
import { consistText, trainLabel, townsById } from './labels';
import { CargoLabel } from './CargoLabel';

type Column = 'stops' | 'cargo' | 'fleet' | 'distance' | 'fact' | 'forecast';

/**
 * The routes of one company: where each runs, what it hauls, what the game paid for it last
 * year, and what the calculator would expect for the same route.
 *
 * The two figures are not a comparison of like with like — the game counts a calendar year of
 * real running, the calculator an idealised economic one — so the pair carries a note saying
 * as much rather than pretending to a verdict.
 */
export function RoutesTab({
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
  const [expanded, setExpanded] = useState<number | null>(null);

  const towns = useMemo(() => townsById(snapshot.towns), [snapshot]);
  const stations = useMemo(
    () => new Map(snapshot.stations.map((station) => [station.id, station])),
    [snapshot],
  );
  const rows = useMemo(
    () => routeRows(snapshot, settings, companyId),
    [snapshot, settings, companyId],
  );

  // one finished year in the game, or the fact is not a year's worth and cannot meet a
  // yearly forecast
  const comparable = hasFinishedYear(snapshot.trains.filter((train) => train.companyId === companyId));

  const stopNames = (row: RouteRow): string[] =>
    stationStops(row.stops).map((stop) => {
      const station = stations.get(stop.stationId!);
      return station ? stationName(station, towns) : t('game.unknownStation');
    });

  /*
   * Sorting is not memoised, and neither is the value map it reads: both hold names that come
   * from the current language, and a memo would have to name the locale as a dependency it
   * never visibly uses. Ordering a few hundred rows costs nothing next to the forecasts above,
   * which are memoised because they do.
   */
  const values: SortValues<RouteRow, Column> = {
    stops: (row) => stopNames(row).join(' — ') || null,
    cargo: (row) => (row.cargo ? cargoName(row.cargo) : null),  // sorted by name, shown with its icon
    fleet: (row) => row.trains.length,
    distance: (row) => (row.blocker === 'multiStop' ? null : row.distanceTiles),
    // the same figure the cell shows, or the header would sort by a number that is not there
    fact: (row) => (comparable ? row.profitLastYear : row.profitThisYear),
    forecast: (row) => row.forecast?.profitPerYear ?? null,
  };
  const shown = sortRows(rows, sort, values, new Intl.Collator(intlLocale(locale)));

  return (
    <TableFrame pinEdges rowCount={shown.length} emptyMessage={t('game.noRoutes')}>
      <Table.Thead>
        <Table.Tr>
          <SortableTh column="stops" sort={sort} onSort={setSort}>
            {t('game.route')}
          </SortableTh>
          <SortableTh column="cargo" sort={sort} onSort={setSort}>
            {t('game.cargo')}
          </SortableTh>
          <SortableTh column="fleet" sort={sort} onSort={setSort}>
            {t('game.fleet')}
          </SortableTh>
          <SortableTh column="distance" sort={sort} onSort={setSort}>
            {t('game.distance')}
          </SortableTh>
          <SortableTh column="fact" sort={sort} onSort={setSort} className="cell-money">
            <Tooltip label={t('game.factHint')} multiline w={320}>
              {/* the column states this year while the game has no finished one behind it,
                  so the heading says which year it is showing */}
              <span>{comparable ? t('game.fact') : t('game.factThisYear')}</span>
            </Tooltip>
          </SortableTh>
          <SortableTh column="forecast" sort={sort} onSort={setSort} className="cell-money">
            <Tooltip label={t('game.forecastHint')} multiline w={320}>
              <span>{t('game.forecast')}</span>
            </Tooltip>
          </SortableTh>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((row) => (
          <RouteRows
            key={row.id}
            row={row}
            names={stopNames(row)}
            expanded={expanded === row.id}
            onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
            comparable={comparable}
          />
        ))}
      </Table.Tbody>
    </TableFrame>
  );
}

function RouteRows({
  row,
  names,
  expanded,
  onToggle,
  comparable,
}: {
  row: RouteRow;
  names: string[];
  expanded: boolean;
  onToggle: () => void;
  /** Whether the game has a finished year to state as the fact. */
  comparable: boolean;
}) {
  return (
    <>
      <Table.Tr className="route-row" onClick={onToggle}>
        <Table.Td>
          <span className="expand-mark">{expanded ? '▾' : '▸'}</span> {routeTitle(names)}
        </Table.Td>
        <Table.Td>{row.cargo ? <CargoLabel cargo={row.cargo} /> : '—'}</Table.Td>
        {/* the count, with what they are made of on hover: a consist of twenty wagons spelled
            out in the row pushes the fact and the forecast — the point of the table — off the
            page, and wrapping it makes every row four lines tall. The full consist is one
            click away in the detail below */}
        <Table.Td title={row.consist === null ? t('game.mixedConsists') : consistText(row.consist)}>
          {row.trains.length}
        </Table.Td>
        {/* the leg the model would run; a longer rotation has no single one, and its first
            leg is not the distance of the route */}
        <Table.Td>
          {row.blocker === 'multiStop' || row.distanceTiles === null
            ? '—'
            : num(row.distanceTiles)}
        </Table.Td>
        <Table.Td className="cell-money">
          {comparable ? (
            <>
              <Money value={row.profitLastYear} />
              {/* this year is not over, so it stands under the comparable figure rather than
                  beside it: on one line the pair outgrows its column */}
              <span className="hint second-line">
                {t('game.thisYear')}: <Money value={row.profitThisYear} />
              </span>
            </>
          ) : (
            /* no finished year yet: stating a zero for it would read as "earned nothing" */
            <>
              <Money value={row.profitThisYear} />
              <span className="hint second-line">{t('game.noFinishedYear')}</span>
            </>
          )}
        </Table.Td>
        <Table.Td className="cell-money">
          {row.forecast ? (
            <Money value={row.forecast.profitPerYear} />
          ) : (
            <span className="hint">{t(`game.blocker.${row.blocker!}`)}</span>
          )}
        </Table.Td>
      </Table.Tr>
      {expanded && (
        <Table.Tr className="route-detail">
          <Table.Td colSpan={6}>
            <RouteDetail row={row} names={names} comparable={comparable} />
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function RouteDetail({
  row,
  names,
  comparable,
}: {
  row: RouteRow;
  names: string[];
  comparable: boolean;
}) {
  // the same stops `names` was built from, or the two lists would drift apart
  const stops = stationStops(row.stops);
  return (
    <div className="route-detail-body">
      <div>
        <b>{t('game.stops')}</b>
        <ol>
          {stops.map((stop, i) => (
            <li key={i}>
              {names[i] ?? t('game.unknownStation')}
              {stop.fullLoad && <span className="hint"> · {t('game.fullLoad')}</span>}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <b>{t('game.fleetTrains')}</b>
        <ul>
          {row.trains.map((train) => (
            <li key={train.id}>
              {trainLabel(train)} · {consistText(train.consist)} ·{' '}
              {/* the same year the row above states: a game without a finished one would
                  otherwise show every train a zero as though it had earned nothing */}
              <Money value={comparable ? train.profitLastYear : train.profitThisYear} />
            </li>
          ))}
        </ul>
      </div>
      {row.forecast && (
        <div>
          <b>{t('game.forecastBreakdown')}</b>
          <ul>
            <li>{t('game.distance')}: {num(row.distanceTiles!)}</li>
            <li>
              {t('game.cargo')}: {row.cargo ? <CargoLabel cargo={row.cargo} /> : '—'}
            </li>
            <li>{t('game.roundTrip')}: {num(row.forecast.roundTripDays, 1)}</li>
            <li>{t('game.tripsPerYear')}: {num(row.forecast.tripsPerYear, 1)}</li>
            <li>
              {t('game.incomePerTrip')}: <Money value={row.forecast.incomePerTrip} />
            </li>
            <li>
              {t('game.runningPerYear')}: <Money value={row.forecast.runningCostPerYear} />
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

/*
 * A route of two stations reads as "A — B"; a mail run round eighteen towns would otherwise
 * push the column past the width of the page. The ends are what identifies such a route, and
 * the full order is a click away in the detail below.
 */
function routeTitle(names: readonly string[]): string {
  if (names.length <= 3) return names.join(' — ');
  return `${names[0]} — … — ${names[names.length - 1]} (${t('game.stopCount', { count: names.length })})`;
}
