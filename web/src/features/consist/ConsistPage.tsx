import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import {
  activeCargoByLabel,
  activeCargos,
  activeTrains,
  activeTrainsMeta,
  canCarryIn,
} from '../../dataset';
import type { Train } from '../../types';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { money, num, speed } from '../../components/format';
import { CargoIcon } from '../../components/CargoIcon';
import { TrainImage } from '../../components/TrainImage';
import { useConsistStore } from '../../state/consistStore';
import { useSettingsStore } from '../../state/settingsStore';
import { consistStats } from '../../engine/consist';
import { purchaseRepresentatives } from '../../engine/purchase';
import { trainBuyCost, trainRunningCostPerYear } from '../../engine/costs';

/** Rows held in the DOM at a time; the catalogue itself runs to ~965 purchase entries. */
const PAGE_SIZE = 50;

export default function ConsistPage() {
  const store = useConsistStore();
  const addToConsist = useConsistStore((s) => s.add);
  const { game, calc } = useSettingsStore();
  const [kindFilter, setKindFilter] = useState<'all' | 'engine' | 'wagon'>('all');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(1950);
  const [track, setTrack] = useState<'all' | 'RAIL' | 'NG' | 'METRO'>('RAIL');
  const [cargoFilter, setCargoFilter] = useState('');
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Train>>({
    columnAccessor: 'intro_year',
    direction: 'asc',
  });
  const [page, setPage] = useState(1);

  const locale = useLocale();
  const cargoList = useMemo(() => sortCargos(activeCargos(game), locale), [game, locale]);
  /**
   * Набор держит семейства визуальных вариантов (десяток «Mail Van» с одними числами и
   * разными спрайтами), поэтому каталог показывает пункты списка покупки — то, что игрок
   * различает в игре. Схлопывается один раз на весь набор, до фильтров: внутри пункта
   * совпадают и рефит, и `model_life`, так что фильтр по грузу или году не может оставить
   * одного члена пункта и убрать другого, а представитель не прыгает при вводе в поиск.
   */
  const catalogue = useMemo(
    () => purchaseRepresentatives(activeTrains(game), calc.capacityIndex, game),
    [game, calc.capacityIndex],
  );
  const filtered = useMemo(() => {
    const cargo = cargoFilter ? activeCargoByLabel(game).get(cargoFilter) : null;
    return catalogue.filter((train) => {
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
  }, [catalogue, kindFilter, search, year, track, cargoFilter, game]);

  /**
   * DataTable reports which column to sort by and leaves the sorting to us, so
   * every sortable column needs the value it sorts on — including the ones that
   * are computed rather than stored (price, running cost, capacity).
   */
  const sortValue: Record<string, (train: Train) => number | string> = useMemo(
    () => ({
      name: (train) => train.name,
      intro_year: (train) => train.intro_year,
      power_hp: (train) => train.power_hp ?? 0,
      speed: (train) => train.speed_mph ?? 0,
      weight_t: (train) => train.weight_t,
      capacity: (train) => train.capacities[calc.capacityIndex] ?? 0,
      cost: (train) => trainBuyCost(train, activeTrainsMeta(game), game, calc),
      running: (train) => trainRunningCostPerYear(train, activeTrainsMeta(game), game, calc),
    }),
    [game, calc],
  );

  const sorted = useMemo(() => {
    const value = sortValue[sortStatus.columnAccessor as string];
    if (!value) return filtered;
    const collator = new Intl.Collator(intlLocale(locale), { numeric: true });
    const rows = [...filtered].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return typeof left === 'string' && typeof right === 'string'
        ? collator.compare(left, right)
        : Number(left) - Number(right);
    });
    return sortStatus.direction === 'desc' ? rows.reverse() : rows;
  }, [filtered, sortStatus, sortValue, locale]);

  // a narrower filter can leave the current page beyond the end of the results
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const records = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  );

  const cargo = store.cargoLabel ? (activeCargoByLabel(game).get(store.cargoLabel) ?? null) : null;
  const stats = useMemo(
    () => consistStats(store.entries, cargo, calc.capacityIndex, activeTrainsMeta(game), game, calc),
    [store.entries, cargo, calc, game],
  );

  const cargoOptions = cargoList.map((c) => ({ value: c.label, label: cargoName(c) }));

  return (
    <div className="page-consist">
      <section className="catalogue">
        <Title order={2}>{t('consist.catalogue')}</Title>
        <Group className="filters" align="flex-end" gap="xs">
          <Select
            allowDeselect={false}
            value={kindFilter}
            onChange={(v) => v && setKindFilter(v as typeof kindFilter)}
            data={[
              { value: 'all', label: t('consist.filter.all') },
              { value: 'engine', label: t('consist.filter.engines') },
              { value: 'wagon', label: t('consist.filter.wagons') },
            ]}
          />
          <Select
            allowDeselect={false}
            value={track}
            onChange={(v) => v && setTrack(v as typeof track)}
            data={[
              { value: 'all', label: `${t('consist.filter.track')}: ${t('consist.filter.all')}` },
              { value: 'RAIL', label: 'RAIL' },
              { value: 'NG', label: 'NG' },
              { value: 'METRO', label: 'METRO' },
            ]}
          />
          <NumberInput
            label={t('consist.filter.year')}
            min={1860}
            max={2050}
            value={year}
            onChange={(v) => setYear(Number(v) || 1860)}
          />
          <Group gap={4} wrap="nowrap" className="field-with-icon">
            <CargoIcon icon={cargoList.find((c) => c.label === cargoFilter)?.icon ?? ''} />
            <Select
              searchable
              value={cargoFilter || null}
              onChange={(v) => setCargoFilter(v ?? '')}
              placeholder={`${t('consist.filter.cargo')}: ${t('consist.filter.any')}`}
              data={cargoOptions}
            />
          </Group>
          <TextInput
            type="search"
            placeholder={t('consist.filter.search')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </Group>
        <div className="table-wrap">
          <DataTable
            idAccessor="id"
            records={records}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            totalRecords={sorted.length}
            recordsPerPage={PAGE_SIZE}
            page={currentPage}
            onPageChange={setPage}
            pinFirstColumn
            pinLastColumn
            noRecordsText={t('table.noRecords')}
            paginationText={({ from, to, totalRecords }) =>
              `${from}–${to} ${t('table.of')} ${totalRecords}`
            }
            columns={[
              {
                accessor: 'image',
                title: '',
                render: (train) => <TrainImage trainId={train.id} />,
              },
              { accessor: 'name', title: t('table.name'), sortable: true },
              { accessor: 'intro_year', title: t('table.year'), sortable: true },
              {
                accessor: 'power_hp',
                title: t('table.power'),
                sortable: true,
                render: (train) => (train.power_hp ? `${num(train.power_hp)} ${t('units.hp')}` : '—'),
              },
              {
                accessor: 'speed',
                title: t('table.speed'),
                sortable: true,
                render: (train) => (train.speed_internal ? speed(train.speed_internal) : '—'),
              },
              {
                accessor: 'weight_t',
                title: t('table.weight'),
                sortable: true,
                render: (train) => `${num(train.weight_t)} ${t('units.t')}`,
              },
              {
                accessor: 'capacity',
                title: t('table.capacity'),
                sortable: true,
                render: (train) => {
                  const capacity = train.capacities[calc.capacityIndex] ?? 0;
                  return capacity ? num(capacity) : '—';
                },
              },
              {
                accessor: 'cost',
                title: t('table.cost'),
                sortable: true,
                textAlign: 'right',
                render: (train) => money(trainBuyCost(train, activeTrainsMeta(game), game, calc)),
              },
              {
                accessor: 'running',
                title: t('table.running'),
                sortable: true,
                textAlign: 'right',
                render: (train) =>
                  money(trainRunningCostPerYear(train, activeTrainsMeta(game), game, calc)),
              },
              {
                accessor: 'add',
                title: '',
                render: (train) => (
                  <ActionIcon
                    className="btn-add"
                    aria-label={t('consist.add')}
                    onClick={() => addToConsist(train.id)}
                  >
                    +
                  </ActionIcon>
                ),
              },
            ]}
          />
        </div>
      </section>

      <Paper component="aside" className="consist-side" p="sm">
        <Title order={2}>{t('consist.panel')}</Title>
        {store.entries.length === 0 ? (
          <Text className="hint">{t('consist.empty')}</Text>
        ) : (
          <Stack gap={4} className="consist-list">
            {store.entries.map(({ train, count }) => (
              <Group key={train.id} gap={6} wrap="nowrap">
                <TrainImage trainId={train.id} />
                <Text className="consist-name">{train.name}</Text>
                <NumberInput
                  min={0}
                  value={count}
                  onChange={(v) => store.setCount(train.id, Number(v) || 0)}
                  w={70}
                />
                <ActionIcon aria-label={t('consist.remove')} onClick={() => store.remove(train.id)}>
                  ×
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
        {store.entries.length > 0 && (
          <Button
            className="btn-clear"
            onClick={() => {
              store.clear();
              notifications.show({ message: t('notify.consistCleared') });
            }}
          >
            {t('consist.clear')}
          </Button>
        )}

        <Select
          className="field"
          label={t('consist.cargoForCapacity')}
          searchable
          leftSection={<CargoIcon icon={cargoList.find((c) => c.label === store.cargoLabel)?.icon ?? ''} />}
          placeholder={t('consist.none')}
          value={store.cargoLabel ?? null}
          onChange={(v) => store.setCargoLabel(v)}
          data={cargoOptions}
        />

        {store.entries.length > 0 && (
          <Table className="summary-table" withRowBorders={false}>
            <Table.Tbody>
              <StatRow label={t('consist.stats.power')} value={`${num(stats.powerHp)} ${t('units.hp')}`} />
              <StatRow
                label={t('consist.stats.maxTe')}
                value={`${num(stats.maxTeN / 1000, 1)} ${t('units.kN')}`}
              />
              <StatRow
                label={t('consist.stats.weight')}
                value={`${num(stats.emptyWeightT)} / ${num(stats.loadedWeightT)} ${t('units.t')}`}
              />
              <StatRow
                label={t('consist.stats.length')}
                value={`${num(stats.lengthTiles, 2)} ${t('consist.stats.tiles')}`}
              />
              <StatRow
                label={t('consist.stats.speedLimit')}
                value={stats.speedLimitInternal ? speed(stats.speedLimitInternal) : '—'}
              />
              <StatRow
                label={t('consist.stats.balancing')}
                value={speed(stats.balancingSpeedInternal)}
              />
              <StatRow
                label={t('consist.stats.balancingGrade')}
                value={speed(stats.balancingSpeedOnGradeInternal)}
              />
              <StatRow
                label={t('consist.stats.capacity')}
                value={`${num(stats.capacityForCargo)} ${cargoUnits(cargo?.units)}`}
              />
              <StatRow label={t('consist.stats.buyCost')} value={money(stats.buyCostTotal)} />
              <StatRow label={t('consist.stats.runningCost')} value={money(stats.runningCostTotal)} />
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Table.Tr>
      <Table.Td>{label}</Table.Td>
      <Table.Td align="right">{value}</Table.Td>
    </Table.Tr>
  );
}
