import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { activeCargoByLabel, activeCargos, activeTrains, activeTrainsMeta, canCarryIn } from '../../dataset';
import type { Train } from '../../types';
import { t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { money, num } from '../../components/format';
import { CargoIcon } from '../../components/CargoIcon';
import { TrainImage } from '../../components/TrainImage';
import { useConsistStore } from '../../state/consistStore';
import { useSettingsStore } from '../../state/settingsStore';
import { consistStats } from '../../engine/consist';
import { trainBuyCost, trainRunningCostPerYear } from '../../engine/costs';

const columnHelper = createColumnHelper<Train>();

export default function ConsistPage() {
  const store = useConsistStore();
  const addToConsist = useConsistStore((s) => s.add);
  const { game, calc } = useSettingsStore();
  const [kindFilter, setKindFilter] = useState<'all' | 'engine' | 'wagon'>('all');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(1950);
  const [track, setTrack] = useState<'all' | 'RAIL' | 'NG' | 'METRO'>('RAIL');
  const [cargoFilter, setCargoFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'intro_year', desc: false }]);

  const locale = useLocale();
  const cargoList = useMemo(() => sortCargos(activeCargos(game), locale), [game, locale]);
  const filtered = useMemo(() => {
    const cargo = cargoFilter ? activeCargoByLabel(game).get(cargoFilter) : null;
    return activeTrains(game).filter((train) => {
      if (kindFilter !== 'all' && train.kind !== kindFilter) return false;
      if (track !== 'all' && train.base_track_type !== track) return false;
      if (train.intro_year > year) return false;
      // a model is on sale until intro + model_life; vehicle_life is how long a
      // single unit lasts before wearing out, which does not gate the catalogue
      // (same rule as the optimizer applies, see engine/optimize.ts)
      if (train.model_life != null && year >= train.intro_year + train.model_life) return false;
      if (search && !train.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (cargo && !canCarryIn(game, train, cargo)) return false;
      return true;
    });
  }, [kindFilter, search, year, track, cargoFilter, game]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'image',
        header: '',
        cell: (info) => <TrainImage trainId={info.row.original.id} />,
      }),
      columnHelper.accessor('name', { header: () => t('table.name') }),
      columnHelper.accessor('intro_year', { id: 'intro_year', header: () => t('table.year') }),
      columnHelper.accessor('power_hp', {
        header: () => t('table.power'),
        cell: (info) => (info.getValue() ? `${num(info.getValue())} ${t('units.hp')}` : '—'),
      }),
      columnHelper.accessor((row) => row.speed_mph ?? 0, {
        id: 'speed',
        header: () => t('table.speed'),
        cell: (info) => (info.getValue() ? `${info.getValue()} ${t('units.mph')}` : '—'),
      }),
      columnHelper.accessor('weight_t', {
        header: () => t('table.weight'),
        cell: (info) => `${num(info.getValue())} ${t('units.t')}`,
      }),
      columnHelper.accessor((row) => row.capacities[calc.capacityIndex] ?? 0, {
        id: 'capacity',
        header: () => t('table.capacity'),
        cell: (info) => (info.getValue() ? num(info.getValue()) : '—'),
      }),
      columnHelper.accessor((row) => trainBuyCost(row, activeTrainsMeta(game), game, calc), {
        id: 'cost',
        header: () => t('table.cost'),
        cell: (info) => money(info.getValue()),
        meta: { className: 'cell-money' },
      }),
      columnHelper.accessor((row) => trainRunningCostPerYear(row, activeTrainsMeta(game), game, calc), {
        id: 'running',
        header: () => t('table.running'),
        cell: (info) => money(info.getValue()),
        meta: { className: 'cell-money' },
      }),
      columnHelper.display({
        id: 'add',
        header: '',
        cell: (info) => (
          <button className="btn-add" onClick={() => addToConsist(info.row.original.id)}>
            +
          </button>
        ),
      }),
    ],
    [calc, game, addToConsist],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const cargo = store.cargoLabel ? (activeCargoByLabel(game).get(store.cargoLabel) ?? null) : null;
  const stats = useMemo(
    () => consistStats(store.entries, cargo, calc.capacityIndex, activeTrainsMeta(game), game, calc),
    [store.entries, cargo, calc, game],
  );

  return (
    <div className="page-consist">
      <section className="catalogue">
        <h2>{t('consist.catalogue')}</h2>
        <div className="filters">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
            <option value="all">{t('consist.filter.all')}</option>
            <option value="engine">{t('consist.filter.engines')}</option>
            <option value="wagon">{t('consist.filter.wagons')}</option>
          </select>
          <select value={track} onChange={(e) => setTrack(e.target.value as typeof track)}>
            <option value="all">{t('consist.filter.track')}: {t('consist.filter.all')}</option>
            <option value="RAIL">RAIL</option>
            <option value="NG">NG</option>
            <option value="METRO">METRO</option>
          </select>
          <label>
            {t('consist.filter.year')}
            <input
              type="number"
              value={year}
              min={1860}
              max={2050}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <span className="field-with-icon">
            <CargoIcon icon={cargoList.find((c) => c.label === cargoFilter)?.icon ?? ''} />
            <select value={cargoFilter} onChange={(e) => setCargoFilter(e.target.value)}>
              <option value="">{t('consist.filter.cargo')}: {t('consist.filter.any')}</option>
              {cargoList.map((c) => (
                <option key={c.label} value={c.label}>
                  {cargoName(c)}
                </option>
              ))}
            </select>
          </span>
          <input
            type="search"
            placeholder={t('consist.filter.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={[header.column.getCanSort() ? 'sortable' : '', (header.column.columnDef.meta as { className?: string } | undefined)?.className ?? ''].join(' ')}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.slice(0, 400).map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={(cell.column.columnDef.meta as { className?: string } | undefined)?.className}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="consist-side">
        <h2>{t('consist.panel')}</h2>
        {store.entries.length === 0 ? (
          <p className="hint">{t('consist.empty')}</p>
        ) : (
          <ul className="consist-list">
            {store.entries.map(({ train, count }) => (
              <li key={train.id}>
                <TrainImage trainId={train.id} />
                <span className="consist-name">{train.name}</span>
                <input
                  type="number"
                  min={0}
                  value={count}
                  onChange={(e) => store.setCount(train.id, Number(e.target.value))}
                />
                <button onClick={() => store.remove(train.id)}>×</button>
              </li>
            ))}
          </ul>
        )}
        {store.entries.length > 0 && (
          <button className="btn-clear" onClick={store.clear}>
            {t('consist.clear')}
          </button>
        )}

        <label className="field">
          {t('consist.cargoForCapacity')}
          <span className="field-with-icon">
            <CargoIcon icon={cargoList.find((c) => c.label === store.cargoLabel)?.icon ?? ''} />
            <select
              value={store.cargoLabel ?? ''}
              onChange={(e) => store.setCargoLabel(e.target.value || null)}
            >
              <option value="">{t('consist.none')}</option>
              {cargoList.map((c) => (
                <option key={c.label} value={c.label}>
                  {cargoName(c)}
                </option>
              ))}
            </select>
          </span>
        </label>

        {store.entries.length > 0 && (
          <dl className="stats">
            <dt>{t('consist.stats.power')}</dt>
            <dd>
              {num(stats.powerHp)} {t('units.hp')}
            </dd>
            <dt>{t('consist.stats.maxTe')}</dt>
            <dd>
              {num(stats.maxTeN / 1000, 1)} {t('units.kN')}
            </dd>
            <dt>{t('consist.stats.weight')}</dt>
            <dd>
              {num(stats.emptyWeightT)} / {num(stats.loadedWeightT)} {t('units.t')}
            </dd>
            <dt>{t('consist.stats.length')}</dt>
            <dd>
              {num(stats.lengthTiles, 2)} {t('consist.stats.tiles')}
            </dd>
            <dt>{t('consist.stats.speedLimit')}</dt>
            <dd>{stats.speedLimitMph ? `${stats.speedLimitMph} ${t('units.mph')}` : '—'}</dd>
            <dt>{t('consist.stats.balancing')}</dt>
            <dd>
              {stats.balancingSpeedMph} {t('units.mph')}
            </dd>
            <dt>{t('consist.stats.balancingGrade')}</dt>
            <dd>
              {stats.balancingSpeedOnGradeMph} {t('units.mph')}
            </dd>
            <dt>{t('consist.stats.capacity')}</dt>
            <dd>
              {num(stats.capacityForCargo)} {cargoUnits(cargo?.units)}
            </dd>
            <dt>{t('consist.stats.buyCost')}</dt>
            <dd>{money(stats.buyCostTotal)}</dd>
            <dt>{t('consist.stats.runningCost')}</dt>
            <dd>{money(stats.runningCostTotal)}</dd>
          </dl>
        )}
      </aside>
    </div>
  );
}
