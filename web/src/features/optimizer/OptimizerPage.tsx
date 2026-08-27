import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useSettingsStore } from '../../state/settingsStore';
import { Field } from '../../components/Field';
import { fieldWidth } from '../../skin';
import { IconSwitch } from '../../components/IconSwitch';
import { YearField } from '../../components/YearField';
import { useNavigate } from 'react-router';
import {
  activeCargos,
  activeTrains,
  activeTrainsMeta,
  cargoConsumers,
  economies,
  economyIdForPayment,
  supplyTargetFor,
} from '../../dataset';
import { intlLocale, t, useLocale } from '../../i18n';
import { cargoName, cargoUnits, industryName, sortCargos } from '../../i18n/names';
import {
  engineLabel, num, percent, speedUnitLabel, speedValue, unitSuffix, wagonLabel, withUnit,
} from '../../components/format';
import { Money } from '../../components/Money';
import { optimizeConsists, type OptimizeResult } from '../../engine/optimize';
import { hasVerdict, supplyFigure, type SupplyTarget } from '../../engine/supply';
import { createOptimizerCache } from '../../engine/optimizeCache';
import { cargoPaymentRate } from '../../engine/income';
import { waitTimeThresholdDays, type StationRating } from '../../engine/rating';
import { effectiveDayLength } from '../../engine/settings';
import { introRandomisationActive, type IntroAvailability } from '../../engine/availability';
import { doubtfulGroups } from './doubtful';
import { SORT_VALUES, type OptimizerSort } from './sorting';
import { sortRows } from '../../components/table/sorting';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { useConsistStore } from '../../state/consistStore';
import { useRouteStore } from '../../state/routeStore';
import { CargoIcon } from '../../components/CargoIcon';
import { TrainImage } from '../../components/TrainImage';
import { useActiveCargo } from '../useActiveCargo';
import { PrefillNote } from '../../components/PrefillNote';

/** Rows drawn before the "show more" button; the search itself still ranks all of them. */
const PAGE_SIZE = 15;

/** Tooltip listing what the estimated station rating is made of. */
function ratingBreakdown(r: StationRating): string {
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v)}`;
  const total = Math.round(r.rating);
  // Every part is shown rounded, so rounding each on its own would let the column add up to
  // one off the total. The swing — the gap between the rating and the parts it is made of —
  // absorbs that: it is whatever is left after the others, which is also what it means.
  const parts = [r.parts.speed, r.parts.waitTime, r.parts.waitingCargo, r.parts.age].map(Math.round);
  const swing = total - parts.reduce((sum, part) => sum + part, 0);
  return [
    `${t('opt.ratingSpeed')}: ${signed(parts[0])}`,
    `${t('opt.ratingWait')}: ${signed(parts[1])}`,
    `${t('opt.ratingCargo')}: ${signed(parts[2])}`,
    `${t('opt.ratingAge')}: ${signed(parts[3])}`,
    // A station balances between two penalty steps rather than on one, so the rating is the
    // average of the two and the parts above fall short of it. Shown only where the gap is
    // visible at all, or the line would read "+0".
    ...(swing === 0 ? [] : [`${t('opt.ratingSwing')}: ${signed(swing)}`]),
    `${t('opt.ratingTotal')}: ${total}/255`,
  ].join('\n');
}

/**
 * Which loading branch the row won in. Shown only where the branches actually differ: on a
 * route the source keeps up with, the full-load order changes nothing and saying so would be
 * noise. Struck through when the order is the thing costing the route its haul.
 */
function LoadingBranchMark({ row }: { row: OptimizeResult }) {
  if (!row.branchesDiffer || !row.otherBranch) return null;
  // What the branch that lost would have given, so the tooltip compares rather than asserts.
  const other = {
    interval: num(row.otherBranch.pickupIntervalDays, 1),
    cargo: num(row.otherBranch.cargoPerTrip),
  };
  return (
    <sup
      className={row.waitForFullLoad ? 'branch-mark' : 'branch-mark branch-mark--off'}
      title={
        row.waitForFullLoad
          ? t('opt.branchWait', { days: num(row.waitDays, 1), ...other })
          : t('opt.branchNoWait', other)
      }
    >
      {t('opt.fullLoadMark')}
    </sup>
  );
}

/** «Май 1960» на языке интерфейса. */
function monthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Отметка у машины, которой в выбранном году может ещё не быть в списке покупки:
 * дата появления в игре точнее года и вдобавок рандомизируется (engine/availability.ts).
 */
function IntroNote({ intro }: { intro: IntroAvailability }) {
  if (intro.certain) return null;
  return (
    <sup className="intro-warn" title={introTitle(intro)}>
      ?
    </sup>
  );
}

/**
 * Supply column cell. What it shows follows the receiving industry's own rule: a secondary
 * converts what it is fed, so the figure is the interval against the window; a primary or port
 * earns a production bonus by volume across the window, so the figure is that bonus and the
 * ratio drops to a footnote in the tooltip. Colouring a pool industry by its interval would
 * answer a question it never asks.
 *
 * The figure comes from `supplyFigure`, the same call the sort map makes, so the header can
 * never order rows by a number this cell does not show.
 */
function SupplyCell({ row, target }: { row: OptimizeResult; target: SupplyTarget }) {
  const supply = row.supply;
  const figure = supplyFigure(supply);
  const pool = target.industry.supply_pool;
  const inputCount = 1 + target.otherRatios.length;

  if (!supply || !hasVerdict(supply.rule)) {
    return (
      <Table.Td
        title={supply?.rule === 'no-supplies' ? t('opt.supplyNoSupplies') : t('opt.supplyRuleUnknown')}
      >
        —
      </Table.Td>
    );
  }
  if (!figure) return <Table.Td title={t('opt.supplyNeedsProduction')}>—</Table.Td>;

  // Both rules name the interval, the window and the fleet that would hold it; the pool adds
  // its own numbers on top of that rather than in place of it.
  const common = [
    t('opt.supplyHintInterval', {
      interval: num(row.pickupIntervalDays, 1),
      window: num(supply.windowDays, 1),
    }),
    t('opt.supplyHintFleet', { trains: String(supply.trainsForWindow ?? 1) }),
  ];

  if (figure.kind === 'bonus') {
    const hint = [
      t('opt.supplyHintPool', {
        delivered: num(supply.deliveredPerWindow ?? 0),
        window: num(supply.windowDays, 1),
        level1: num(pool?.level1.threshold ?? 0),
        level2: num(pool?.level2.threshold ?? 0),
      }),
      t('opt.supplyHintPoolBonus', {
        percent1: num(pool?.level1.production_percent ?? 0),
        percent2: num(pool?.level2.production_percent ?? 0),
      }),
      t('opt.supplyHintPoolShare'),
      ...common,
    ].join('\n');
    return (
      <Table.Td className={figure.value > 100 ? 'supply-holds' : 'supply-misses'} title={hint}>
        {num(figure.value)}%
      </Table.Td>
    );
  }

  const hint = [
    ...common,
    // Only where there really are other inputs: a coke oven takes one cargo, and speaking of
    // "the other inputs" there would be inventing them.
    ...(inputCount > 1
      ? [t('opt.supplyHintOneCargo', { industry: industryName(target.industry) })]
      : []),
  ].join('\n');
  return (
    <Table.Td className={`supply-${supply.verdict}`} title={hint}>
      {num(figure.value, 2)}
      {supply.verdict === 'misses' && (
        <sup className="intro-warn" title={t('opt.supplyMisses')}>!</sup>
      )}
    </Table.Td>
  );
}

/** Ранняя и поздняя даты появления машины — подсказка для «?» и для чекбоксов. */
function introTitle(intro: IntroAvailability): string {
  const lines = [`${t('opt.introFrom')}: ${monthYear(intro.year, intro.month)}`];
  if (intro.randomised) {
    lines.push(`${t('opt.introLatest')}: ${monthYear(intro.latestYear, intro.latestMonth)}`);
  }
  return lines.join('\n');
}

export default function OptimizerPage() {
  const {
    cargoLabel, distanceTiles: distance, stationTiles, productionPerMonth, goal, maxTrains,
    allowElectric, excludedIds, destinationId, prefillOrigin,
    setCargoLabel, setDistanceTiles: setDistance,
    setStationTiles, setProductionPerMonth, setGoal, setMaxTrains, setAllowElectric,
    setDestinationId, toggleExcluded, clearExcluded,
  } = useOptimizerStore();
  const [engineFilter, setEngineFilter] = useState('');
  const [sort, setSort] = useState<OptimizerSort>(null);
  const [subsidised, setSubsidised] = useState(false);
  const { game, calc } = useSettingsStore();
  // one year for the whole calculator: the field here edits the setting itself
  const year = calc.priceYear;
  const locale = useLocale();
  const navigate = useNavigate();
  const consistStore = useConsistStore();
  const routeStore = useRouteStore();

  const trains = useMemo(() => activeTrains(game), [game]);
  // в селекте только грузы; если сохранённый груз не из активного набора — берём первый
  const cargoList = useMemo(
    () => sortCargos(activeCargos(game), locale),
    [game, locale],
  );
  const cargo = useActiveCargo(cargoList, cargoLabel, setCargoLabel);
  const economyId = economyIdForPayment(game);

  // The search runs synchronously and takes about a second on the worst input (late year,
  // long station, transported goal). Typing a distance would otherwise re-run it per
  // keystroke, so the numeric fields feed the search only after they settle.
  const searchFields = useMemo(
    () => ({ year, distance, stationTiles, productionPerMonth, maxTrains }),
    [year, distance, stationTiles, productionPerMonth, maxTrains],
  );
  const [searchInput] = useDebouncedValue(searchFields, 250);

  // Ranking by transported cargo needs a flow to have a delivered share at all; the engine
  // falls back to profit on its own, the UI only stops the user from picking a dead option.
  // It reads the settled production, not the field: inside the debounce window the rows on
  // screen were computed for the old value, and a goal ahead of them would label columns
  // with numbers that do not belong to the search that produced them.
  const goalAvailable = searchInput.productionPerMonth > 0;

  // Industries of the active economy that take this cargo. The chosen one is resolved on
  // every read, so switching economy cannot leave a consumer from another set standing.
  const consumers = useMemo(() => cargoConsumers(game, cargoLabel), [game, cargoLabel]);
  const supplyTarget = useMemo(
    () => supplyTargetFor(game, cargoLabel, destinationId),
    [game, cargoLabel, destinationId],
  );
  // Nothing takes this cargo — there is nothing to keep supplied, so the goal is not offered.
  const supplyAvailable = goalAvailable && supplyTarget !== null;
  const activeGoal =
    (goal === 'supply' && !supplyAvailable) || !goalAvailable ? 'profit' : goal;

  // The rating thresholds are stated in days, and a slowed JGRPP economy stretches them:
  // at factor 5 the first one sits at 262.5 days, not 52.5. Built at render time so the
  // string follows the language the way the table headers do.
  const intervalHint = t('opt.intervalHint', {
    thresholds: waitTimeThresholdDays(effectiveDayLength(game))
      .map((d) => num(d, 1))
      .join('/'),
  });

  // Consist physics survives between searches, so editing production or the fleet limit
  // only redoes the money. The cache belongs to the tab: the search stays a pure function.
  const searchCache = useRef(createOptimizerCache());

  const results = useMemo(() => {
    if (!cargo) return [];
    return optimizeConsists(
      trains,
      {
        year: searchInput.year,
        distanceTiles: searchInput.distance,
        cargo,
        economyId,
        maxLengthTiles: searchInput.stationTiles,
        productionPerMonth: searchInput.productionPerMonth,
        goal: activeGoal,
        supplyTarget,
        maxTrains: searchInput.maxTrains,
        allowElectric,
        subsidised,
        excludedIds,
        game,
        calc,
      },
      activeTrainsMeta(game),
      50,
      searchCache.current,
    );
  }, [trains, cargo, economyId, searchInput, activeGoal, supplyTarget, allowElectric, subsidised, excludedIds, game, calc]);

  // машины, которые в выбранном году могут ещё не появиться, — их можно выключить
  const collator = useMemo(() => new Intl.Collator(intlLocale(locale)), [locale]);
  const doubtful = useMemo(
    () => doubtfulGroups(results, trains, excludedIds, searchInput.year, game, calc.capacityIndex, collator),
    [results, trains, excludedIds, searchInput.year, game, calc.capacityIndex, collator],
  );

  const matching = useMemo(
    () =>
      engineFilter
        ? results.filter((r) => r.engine.name.toLowerCase().includes(engineFilter.toLowerCase()))
        : results,
    [results, engineFilter],
  );
  // Drawing fifty rows of sprites costs more than the search itself, and the answer is in
  // the first few anyway — the rest is one click away. The page resets on a new set of rows,
  // not on a new row count: a different search of the same size is still a different answer.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [matching]);
  // Sorting is a view over the rows the search returned, not a second ranking: it reorders
  // what is on screen and leaves the set and the numbers alone.
  const ordered = useMemo(() => sortRows(matching, sort, SORT_VALUES, collator), [matching, sort, collator]);

  const shown = ordered.slice(0, visibleCount);
  const hiddenCount = ordered.length - shown.length;

  function applyToConsist(index: number) {
    const r = shown[index];
    consistStore.clear();
    consistStore.add(r.engine.id);
    if (r.engineCount > 1) consistStore.setCount(r.engine.id, r.engineCount);
    consistStore.add(r.wagon.id);
    consistStore.setCount(r.wagon.id, r.wagonCount);
    consistStore.setCargoLabel(cargoLabel);
    routeStore.setCargoLabel(cargoLabel);
    // The row was computed for the settled distance, so that is what travels with it:
    // inside the debounce window the field already holds a distance no row was priced at.
    routeStore.setDistanceTiles(searchInput.distance);
    // The output and the loading branch travel too: both tabs settle a route by the same
    // model, and a row carried over without them would be recomputed by a different one.
    routeStore.setProductionPerMonth(searchInput.productionPerMonth);
    routeStore.setWaitForFullLoad(r.waitForFullLoad);
    navigate('/income');
  }

  return (
    <div className="page-optimizer">
      <Title order={2}>{t('opt.title')}</Title>
      <Group className="filters" align="flex-end" gap="xs">
        <YearField />
        <Select
          {...fieldWidth('wide')}
          label={t('route.cargo')}
          searchable
          allowDeselect={false}
          leftSection={<CargoIcon icon={cargo?.icon ?? ''} />}
          value={cargo?.label ?? null}
          onChange={(v) => v && setCargoLabel(v)}
          data={cargoList.map((c) => ({ value: c.label, label: cargoName(c) }))}
        />
        <NumberInput
          {...fieldWidth('narrow')}
          label={t('opt.distance')}
          suffix={unitSuffix(t('units.tiles'))}
          min={10}
          value={distance}
          onChange={(v) => setDistance(Number(v) || 10)}
        />
        <NumberInput
          {...fieldWidth('narrow')}
          label={t('opt.stationTiles')}
          suffix={unitSuffix(t('units.tiles'))}
          min={1}
          max={16}
          value={stationTiles}
          onChange={(v) => setStationTiles(Number(v) || 1)}
        />
        <Tooltip label={t('opt.productionHint')} multiline w={320}>
          <NumberInput
            {...fieldWidth('narrow')}
            label={t('opt.production')}
            suffix={t('units.perMonth')}
            min={0}
            step={10}
            value={productionPerMonth}
            onChange={(v) => setProductionPerMonth(Math.max(0, Number(v) || 0))}
          />
        </Tooltip>
        {consumers.length > 1 && (
          <Select
            {...fieldWidth('wide')}
            label={t('opt.destination')}
            searchable
            allowDeselect={false}
            value={supplyTarget?.industry.id ?? null}
            onChange={(v) => v && setDestinationId(v)}
            data={consumers.map((i) => ({ value: i.id, label: industryName(i) }))}
          />
        )}
        <Field label={t('opt.goal')} width="content">
          {({ labelId }) => (
            <SegmentedControl
              aria-labelledby={labelId}
              value={activeGoal}
              onChange={(v) => setGoal(v as typeof goal)}
              data={[
                { value: 'profit', label: t('opt.goalProfit') },
                { value: 'transported', label: t('opt.goalTransported'), disabled: !goalAvailable },
                { value: 'supply', label: t('opt.goalSupply'), disabled: !supplyAvailable },
              ]}
            />
          )}
        </Field>
        <Tooltip label={t('opt.maxTrainsHint')} multiline w={320}>
          <NumberInput
            {...fieldWidth('narrow')}
            label={t('opt.maxTrains')}
            min={1}
            max={20}
            value={maxTrains}
            onChange={(v) => setMaxTrains(Math.max(1, Number(v) || 1))}
          />
        </Tooltip>
        <TextInput
          {...fieldWidth('normal')}
          type="search"
          label={t('opt.engineFilter')}
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.currentTarget.value)}
        />
        <IconSwitch
          icon="electrified"
          name={t('opt.allowElectric')}
          checked={allowElectric}
          onChange={setAllowElectric}
        />
        <IconSwitch
          icon="subsidies"
          name={t('opt.subsidised')}
          checked={subsidised}
          onChange={setSubsidised}
        />
      </Group>
      {!goalAvailable && <p className="hint goal-hint">{t('opt.goalNeedsProduction')}</p>}
      <PrefillNote
        origin={prefillOrigin}
        current={{ cargoLabel, distanceTiles: distance, productionPerMonth }}
      />
      {cargo && (
        <p className="hint">
          {cargoName(cargo)} · {economies.find((e) => e.id === economyId)?.name ?? t('settings.vanilla')} ·{' '}
          {t('route.payment')}: {num(cargoPaymentRate(cargo, economyId, game, calc))} ·{' '}
          {productionPerMonth > 0 ? t('opt.assumptionProduction') : t('opt.assumption')}
        </p>
      )}
      {doubtful.length > 0 && (
        <>
          <p className="hint">
            <span className="intro-warn">?</span>{' '}
            {introRandomisationActive(game) ? t('opt.introLegend') : t('opt.introLegendExact')}
          </p>
          <Group className="intro-toggles" gap="xs">
            <Text className="hint">{t('opt.introInclude')}</Text>
            {doubtful.map(({ ids, train, intro, capacity, ambiguous }) => (
              <Checkbox
                key={ids[0]}
                title={introTitle(intro)}
                checked={!ids.every((id) => excludedIds.includes(id))}
                onChange={() => toggleExcluded(ids)}
                label={
                  ambiguous
                    ? `${train.name} (${num(capacity)} ${cargoUnits(cargo?.units)})`
                    : train.name
                }
              />
            ))}
            {excludedIds.length > 0 && (
              <Button
                variant="subtle"
                className="intro-reset"
                onClick={() => {
                  clearExcluded();
                  notifications.show({ message: t('notify.introFilterReset') });
                }}
              >
                {t('opt.introReset')}
              </Button>
            )}
          </Group>
        </>
      )}
      <TableFrame pinEdges rowCount={shown.length} emptyMessage={t('opt.noResults')}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="cell-num">#</Table.Th>
            <SortableTh column="engine" sort={sort} onSort={setSort} colSpan={2}>
              {t('opt.engine')}
            </SortableTh>
            <SortableTh column="wagon" sort={sort} onSort={setSort} colSpan={2}>
              {t('opt.wagons')}
            </SortableTh>
            <SortableTh
              column="cargoTrip"
              sort={sort}
              onSort={setSort}
              title={t('opt.cargoTripHint')}
              className="cell-num"
            >
              {cargo ? withUnit(t('opt.cargoTrip'), cargoUnits(cargo.units)) : t('opt.cargoTrip')}
            </SortableTh>
            <SortableTh column="speed" sort={sort} onSort={setSort} className="cell-num">
              {withUnit(t('opt.speedLoadedEmpty'), speedUnitLabel())}
            </SortableTh>
            <SortableTh column="gradeSpeed" sort={sort} onSort={setSort} className="cell-num">
              {withUnit(t('opt.gradeSpeed'), speedUnitLabel())}
            </SortableTh>
            <SortableTh column="dwell" sort={sort} onSort={setSort} className="cell-num">
              {withUnit(t('opt.dwell'), t('units.days'))}
            </SortableTh>
            <SortableTh column="roundTrip" sort={sort} onSort={setSort} className="cell-num">
              {withUnit(t('combined.roundTrip'), t('units.days'))}
            </SortableTh>
            <SortableTh column="trips" sort={sort} onSort={setSort} className="cell-num">
              {t('opt.trips')}
            </SortableTh>
            <SortableTh
              column="fleet"
              sort={sort}
              onSort={setSort}
              title={t('opt.fleetHint')}
              className="cell-num"
            >
              {t('opt.fleet')}
            </SortableTh>
            <SortableTh
              column="interval"
              sort={sort}
              onSort={setSort}
              title={intervalHint}
              className="cell-num"
            >
              {withUnit(t('opt.interval'), t('units.days'))}
            </SortableTh>
            <SortableTh
              column="rating"
              sort={sort}
              onSort={setSort}
              title={t('opt.ratingHint')}
              className="cell-num"
            >
              {t('opt.rating')}
            </SortableTh>
            {supplyTarget && (
              <SortableTh
                column="supply"
                sort={sort}
                onSort={setSort}
                title={
                  supplyTarget.industry.supply_pool
                    ? t('opt.supplyHintColumnPool')
                    : t('opt.supplyHintColumn')
                }
              >
                {t('opt.supply')}
              </SortableTh>
            )}
            {activeGoal === 'transported' && (
              <SortableTh column="hauled" sort={sort} onSort={setSort} className="cell-num">
                {cargo ? withUnit(t('opt.hauled'), cargoUnits(cargo.units)) : t('opt.hauled')}
              </SortableTh>
            )}
            <SortableTh column="incomeTrip" sort={sort} onSort={setSort} className="cell-money">
              {t('opt.incomeTrip')}
            </SortableTh>
            <SortableTh column="running" sort={sort} onSort={setSort} className="cell-money">
              {t('table.running')}
            </SortableTh>
            <SortableTh column="cost" sort={sort} onSort={setSort} className="cell-money">
              {t('table.cost')}
            </SortableTh>
            <SortableTh column="profit" sort={sort} onSort={setSort} className="cell-money">
              {t('opt.profitYear')}
            </SortableTh>
            <SortableTh column="payback" sort={sort} onSort={setSort} className="cell-num">
              {withUnit(t('opt.payback'), t('units.years'))}
            </SortableTh>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((r, i) => (
            <Table.Tr key={`${r.engine.id}-${r.engineCount}-${r.wagon.id}`}>
              <Table.Td className="cell-num">{i + 1}</Table.Td>
              <Table.Td className="cell-sprite"><TrainImage trainId={r.engine.id} /></Table.Td>
              <Table.Td>
                {engineLabel(r)}
                <IntroNote intro={r.engineIntro} />
                <span className="dim"> ({r.engine.power_hp * r.engineCount} {t('units.hp')})</span>
              </Table.Td>
              <Table.Td className="cell-sprite"><TrainImage trainId={r.wagon.id} /></Table.Td>
              <Table.Td>{wagonLabel(r)}<IntroNote intro={r.wagonIntro} /></Table.Td>
              <Table.Td className="cell-num">
                {num(r.cargoPerTrip)}
                {r.cargoPerTrip < r.capacity - 0.5 && (
                  <span className="dim">/{num(r.capacity)}</span>
                )}
                <LoadingBranchMark row={r} />
              </Table.Td>
              <Table.Td className="cell-num">
                {speedValue(r.loadedSpeedInternal)}/{speedValue(r.emptySpeedInternal)}
              </Table.Td>
              <Table.Td className="cell-num">{speedValue(r.gradeSpeedInternal)}</Table.Td>
              <Table.Td className="cell-num">{num(r.loadingDays, 1)}</Table.Td>
              <Table.Td className="cell-num">{num(r.roundTripDays, 1)}</Table.Td>
              <Table.Td className="cell-num">{num(r.tripsPerYear, 1)}</Table.Td>
              <Table.Td className="cell-num">
                {r.fleetSize}
                {r.fleetLimited && (
                  <sup className="intro-warn" title={t('opt.fleetLimited')}>!</sup>
                )}
              </Table.Td>
              <Table.Td className="cell-num">{num(r.pickupIntervalDays, 1)}</Table.Td>
              <Table.Td
                className="cell-num"
                title={r.stationRating ? ratingBreakdown(r.stationRating) : undefined}
              >
                {r.stationRating ? percent(r.stationRating.deliveredShare) : '—'}
              </Table.Td>
              {supplyTarget && <SupplyCell row={r} target={supplyTarget} />}
              {activeGoal === 'transported' && (
                <Table.Td className="cell-num">{num(r.hauledPerYear)}</Table.Td>
              )}
              <Table.Td className="cell-money"><Money value={r.incomePerTrip} /></Table.Td>
              <Table.Td className="cell-money"><Money value={r.runningCostPerYear} /></Table.Td>
              <Table.Td className="cell-money"><Money value={r.buyCostTotal} /></Table.Td>
              <Table.Td className={"cell-money " + (r.profitPerYear >= 0 ? "profit" : "money-neg")}><Money value={r.profitPerYear} /></Table.Td>
              <Table.Td className="cell-num">
                {r.paybackYears ? num(r.paybackYears, 1) : '—'}
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  className="btn-add"
                  onClick={() => applyToConsist(i)}
                  title={t('opt.apply')}
                  aria-label={t('opt.apply')}
                >
                  →
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </TableFrame>
      {hiddenCount > 0 && (
        <Group className="table-more" gap="xs" align="center">
          <Button variant="subtle" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            {t('opt.showMore', { count: num(Math.min(PAGE_SIZE, hiddenCount)) })}
          </Button>
          <Button variant="subtle" onClick={() => setVisibleCount(matching.length)}>
            {t('opt.showAll', { count: num(matching.length) })}
          </Button>
          <Text className="hint">
            {t('opt.shownOf', { shown: num(shown.length), total: num(matching.length) })}
          </Text>
        </Group>
      )}
    </div>
  );
}
