import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Paper,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { sortRows, type SortState } from '../../components/table/sorting';
import { catalogueSortValues, DEFAULT_SORT, type CatalogueColumn } from './sorting';
import {
  activeCargoByLabel,
  activeCargos,
  activeEntries,
  activeRailtype,
  activeRailtypes,
  activeTrains,
  activeTrainsMeta,
  canCarryIn,
} from '../../dataset';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, sortCargos } from '../../i18n/names';
import { money, num, speed, speedUnitLabel, speedValue, withUnit } from '../../components/format';
import { CargoIcon } from '../../components/CargoIcon';
import { fieldWidth } from '../../skin';
import { TrainImage } from '../../components/TrainImage';
import { TrackTypeField } from '../../components/TrackTypeField';
import { StrandedVehicles } from '../../components/StrandedVehicles';
import { canRunOn, poweredOutputOn, topSpeedOn } from '../../engine/tracktypes';
import { useConsistStore } from '../../state/consistStore';
import { useSettingsStore } from '../../state/settingsStore';
import { YearField } from '../../components/YearField';
import { consistStats } from '../../engine/consist';
import { purchaseRepresentatives } from '../../engine/purchase';
import { trainBuyCost, trainRunningCostPerYear } from '../../engine/costs';

/** Rows held in the DOM at a time; the catalogue itself runs to ~965 purchase entries. */
const PAGE_SIZE = 50;

export default function ConsistPage() {
  const stored = useConsistStore((s) => s.entries);
  const cargoLabel = useConsistStore((s) => s.cargoLabel);
  const addToConsist = useConsistStore((s) => s.add);
  const removeFromConsist = useConsistStore((s) => s.remove);
  const setCount = useConsistStore((s) => s.setCount);
  const clearConsist = useConsistStore((s) => s.clear);
  const setCargoLabel = useConsistStore((s) => s.setCargoLabel);
  const { game, calc } = useSettingsStore();
  const entries = useMemo(() => activeEntries(stored, game), [stored, game]);
  const [kindFilter, setKindFilter] = useState<'all' | 'engine' | 'wagon'>('all');
  const [search, setSearch] = useState('');
  // the buy-menu year is one setting for the whole calculator, not this tab's own state
  const year = calc.priceYear;
  const [cargoFilter, setCargoFilter] = useState('');
  /**
   * The catalogue's default order is itself a sorted column, so `null` is never held: a third
   * click comes back to DEFAULT_SORT instead. Otherwise the list would be sorted with no header
   * marked, and the first click on "Year" would change nothing but the caret.
   */
  const [sort, setSort] = useState<SortState<CatalogueColumn>>(DEFAULT_SORT);
  const setSortOrDefault = (next: SortState<CatalogueColumn>) => setSort(next ?? DEFAULT_SORT);
  const [page, setPage] = useState(1);

  const locale = useLocale();
  const cargoList = useMemo(() => sortCargos(activeCargos(game), locale), [game, locale]);
  /**
   * A cargo chosen before the economy changed can fall outside the new set. Unlike the tabs
   * that need a cargo to compute at all, this one treats "none" as a valid choice, so the
   * stale label is cleared rather than replaced — the capacity row then reads zero, the way
   * it does before a cargo is picked, and the catalogue filter stops narrowing by a cargo
   * the game no longer has.
   */
  useEffect(() => {
    const available = new Set(cargoList.map((c) => c.label));
    if (cargoLabel && !available.has(cargoLabel)) setCargoLabel(null);
    if (cargoFilter && !available.has(cargoFilter)) setCargoFilter('');
  }, [cargoList, cargoFilter, cargoLabel, setCargoLabel]);
  /**
   * Набор держит семейства визуальных вариантов (десяток «Mail Van» с одними числами и
   * разными спрайтами), поэтому каталог показывает пункты списка покупки — то, что игрок
   * различает в игре. Схлопывается один раз на весь набор, до фильтров: внутри пункта
   * совпадают и рефит, и `model_life`, так что фильтр по грузу или году не может оставить
   * одного члена пункта и убрать другого, а представитель не прыгает при вводе в поиск.
   */
  const railtypes = activeRailtypes(game);
  const track = activeRailtype(game, calc.trackType);
  const catalogue = useMemo(
    () => purchaseRepresentatives(activeTrains(game), calc.capacityIndex, game),
    [game, calc.capacityIndex],
  );
  const filtered = useMemo(() => {
    const cargo = cargoFilter ? activeCargoByLabel(game).get(cargoFilter) : null;
    return catalogue.filter((train) => {
      if (kindFilter !== 'all' && train.kind !== kindFilter) return false;
      // the shared track choice, under the same rule the optimizer searches by
      if (!canRunOn(train, track, railtypes)) return false;
      if (train.intro_year > year) return false;
      // a model is on sale until intro + model_life; vehicle_life is how long a
      // single unit lasts before wearing out, which does not gate the catalogue
      // (same rule as the optimizer applies, see engine/optimize.ts)
      if (train.model_life != null && year >= train.intro_year + train.model_life) return false;
      if (search && !train.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (cargo && !canCarryIn(game, train, cargo)) return false;
      return true;
    });
  }, [catalogue, kindFilter, search, year, track, railtypes, cargoFilter, game]);

  const sortValue = useMemo(() => catalogueSortValues(game, calc), [game, calc]);

  const sorted = useMemo(() => {
    const collator = new Intl.Collator(intlLocale(locale), { numeric: true });
    return sortRows(filtered, sort, sortValue, collator);
  }, [filtered, sort, sortValue, locale]);

  // a narrower filter can leave the current page beyond the end of the results
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const records = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  );

  const cargo = cargoLabel ? (activeCargoByLabel(game).get(cargoLabel) ?? null) : null;
  const stats = useMemo(
    () => consistStats(entries, cargo, calc.capacityIndex, activeTrainsMeta(game), game, calc),
    [entries, cargo, calc, game],
  );

  const cargoOptions = cargoList.map((c) => ({ value: c.label, label: cargoName(c) }));

  return (
    <div className="page-consist">
      <section className="catalogue">
        <Title order={2}>{t('consist.catalogue')}</Title>
        <Group className="filters" align="flex-end" gap="xs">
          <Select
            {...fieldWidth('normal')}
            label={t('consist.filter.kind')}
            allowDeselect={false}
            value={kindFilter}
            onChange={(v) => v && setKindFilter(v as typeof kindFilter)}
            data={[
              { value: 'all', label: t('consist.filter.all') },
              { value: 'engine', label: t('consist.filter.engines') },
              { value: 'wagon', label: t('consist.filter.wagons') },
            ]}
          />
          <TrackTypeField />
          <YearField />
          <Select
            {...fieldWidth('wide')}
            label={t('consist.filter.cargo')}
            searchable
            leftSection={<CargoIcon icon={cargoList.find((c) => c.label === cargoFilter)?.icon ?? ''} />}
            value={cargoFilter || null}
            onChange={(v) => setCargoFilter(v ?? '')}
            placeholder={t('consist.filter.any')}
            data={cargoOptions}
          />
          <TextInput
            {...fieldWidth('normal')}
            type="search"
            label={t('consist.filter.name')}
            placeholder={t('consist.filter.search')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </Group>
        <TableFrame pinEdges rowCount={records.length} emptyMessage={t('table.noRecords')}>
          <Table.Thead>
            <Table.Tr>
              <SortableTh column="name" sort={sort} onSort={setSortOrDefault}>
                {t('table.name')}
              </SortableTh>
              <SortableTh column="intro_year" sort={sort} onSort={setSortOrDefault} className="cell-num">
                {t('table.year')}
              </SortableTh>
              <SortableTh column="power_hp" sort={sort} onSort={setSortOrDefault} className="cell-num">
                {withUnit(t('table.power'), t('units.hp'))}
              </SortableTh>
              <SortableTh column="speed" sort={sort} onSort={setSortOrDefault} className="cell-num">
                {withUnit(t('table.speed'), speedUnitLabel())}
              </SortableTh>
              <SortableTh column="weight_t" sort={sort} onSort={setSortOrDefault} className="cell-num">
                {withUnit(t('table.weight'), t('units.t'))}
              </SortableTh>
              <SortableTh column="capacity" sort={sort} onSort={setSortOrDefault} className="cell-num">
                {t('table.capacity')}
              </SortableTh>
              <SortableTh column="cost" sort={sort} onSort={setSortOrDefault} className="cell-money">
                {t('table.cost')}
              </SortableTh>
              <SortableTh column="running" sort={sort} onSort={setSortOrDefault} className="cell-money">
                {t('table.running')}
              </SortableTh>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {records.map((train) => {
              const power = poweredOutputOn(train, track, railtypes);
              const topSpeed = topSpeedOn(train, track);
              return (
                <Table.Tr key={train.id}>
                  {/* one cell, the way a line of the game's purchase list is: the sprite and the
                      name identify the row together, and the pinned first column keeps both */}
                  <Table.Td className="cell-vehicle">
                    <TrainImage trainId={train.id} /> {train.name}
                  </Table.Td>
                  <Table.Td className="cell-num">{train.intro_year}</Table.Td>
                  {/* the figures for the chosen track: an electro-diesel shows the power it
                      makes on this line, a high speed train the speed it reaches there */}
                  <Table.Td className="cell-num">{power ? num(power) : '—'}</Table.Td>
                  <Table.Td className="cell-num">
                    {topSpeed ? speedValue(topSpeed) : '—'}
                  </Table.Td>
                  <Table.Td className="cell-num">{num(train.weight_t)}</Table.Td>
                  <Table.Td className="cell-num">
                    {train.capacities[calc.capacityIndex]
                      ? num(train.capacities[calc.capacityIndex])
                      : '—'}
                  </Table.Td>
                  <Table.Td className="cell-money">
                    {money(trainBuyCost(train, activeTrainsMeta(game), game, calc))}
                  </Table.Td>
                  <Table.Td className="cell-money">
                    {money(trainRunningCostPerYear(train, activeTrainsMeta(game), game, calc))}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      className="btn-add"
                      aria-label={t('consist.add')}
                      onClick={() => addToConsist(train.id)}
                    >
                      +
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </TableFrame>
        {sorted.length > 0 && (
          <Group className="table-more" gap="xs" align="center">
            <Pagination total={pageCount} value={currentPage} onChange={setPage} />
            <Text className="hint">
              {t('table.range', {
                from: num((currentPage - 1) * PAGE_SIZE + 1),
                to: num((currentPage - 1) * PAGE_SIZE + records.length),
                total: num(sorted.length),
              })}
            </Text>
          </Group>
        )}
      </section>

      <Paper component="aside" className="consist-side" p="sm">
        {/* the panel names its own part of the tab, so it is a heading below the
            page's — the tab is titled by the catalogue beside it */}
        <Title order={3}>{t('consist.panel')}</Title>
        {entries.length === 0 ? (
          <TableFrame rowCount={0} emptyMessage={t('consist.empty')} />
        ) : (
          <Stack gap={4} className="consist-list">
            {entries.map(({ train, count }) => (
              <Group key={train.id} gap={6} wrap="nowrap">
                <TrainImage trainId={train.id} />
                <Text className="consist-name">{train.name}</Text>
                <NumberInput
                  min={0}
                  value={count}
                  onChange={(v) => setCount(train.id, Number(v) || 0)}
                  w={84}
                />
                <ActionIcon aria-label={t('consist.remove')} onClick={() => removeFromConsist(train.id)}>
                  ×
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
        {entries.length > 0 && (
          <Button
            className="btn-clear"
            onClick={() => {
              clearConsist();
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
          leftSection={<CargoIcon icon={cargoList.find((c) => c.label === cargoLabel)?.icon ?? ''} />}
          placeholder={t('consist.none')}
          value={cargoLabel ?? null}
          onChange={(v) => setCargoLabel(v)}
          data={cargoOptions}
        />

        <StrandedVehicles entries={entries} game={game} calc={calc} />

        {entries.length > 0 && (
          <Table className="summary-table" withRowBorders={false}>
            <Table.Tbody>
              <StatRow label={t('consist.stats.power')} value={`${num(stats.powerHp)} ${t('units.hp')}`} />
              <StatRow
                label={t('consist.stats.maxTe')}
                value={`${num(stats.maxTeN / 1000, 1)} ${t('units.kN')}`}
              />
              <StatRow
                label={t('consist.stats.weight')}
                value={`${num(stats.emptyWeightT)}/${num(stats.loadedWeightT)} ${t('units.t')}`}
              />
              <StatRow
                label={t('consist.stats.length')}
                value={`${num(stats.lengthTiles, 2)} ${t('units.tiles')}`}
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
